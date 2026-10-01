# Deposit Demo â€” local web server (no Node.js required)
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$PublicDir = Join-Path $Root "public"
$EnvFile = Join-Path $Root ".env"
$DataDir = Join-Path $Root "data"
$CustomersFile = Join-Path $DataDir "customers.json"

function Load-EnvFile {
    param([string]$Path)
    $vars = @{}
    if (-not (Test-Path $Path)) { return $vars }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        $vars[$key] = $val
    }
    return $vars
}

function Get-Config {
    $env = Load-EnvFile -Path $EnvFile
    $environment = if ($env["PAYSAFE_ENVIRONMENT"]) { $env["PAYSAFE_ENVIRONMENT"].ToUpper() } else { "TEST" }
    $currency = if ($env["PAYSAFE_CURRENCY"]) { $env["PAYSAFE_CURRENCY"] } else { "USD" }
    $port = if ($env["PORT"]) { [int]$env["PORT"] } else { 4000 }
    $accountId = if ($env["PAYSAFE_ACCOUNT_ID"]) { $env["PAYSAFE_ACCOUNT_ID"] } else { $null }
    $googlePayAccountCc = if ($env["PAYSAFE_GOOGLEPAY_ACCOUNT_CC"]) { $env["PAYSAFE_GOOGLEPAY_ACCOUNT_CC"] } else { $accountId }
    $googlePayMerchantId = if ($env["PAYSAFE_GOOGLEPAY_MERCHANT_ID"]) { $env["PAYSAFE_GOOGLEPAY_MERCHANT_ID"] } else { "012345678987654321" }
    $googlePayLabel = if ($env["PAYSAFE_GOOGLEPAY_LABEL"]) { $env["PAYSAFE_GOOGLEPAY_LABEL"] } else { "Deposit Demo" }
    $googlePayCountry = if ($env["PAYSAFE_GOOGLEPAY_COUNTRY"]) { $env["PAYSAFE_GOOGLEPAY_COUNTRY"] } else { "GB" }
    $googlePayEnabled = $false
    if ($env["PAYSAFE_GOOGLEPAY_ENABLED"]) {
        $googlePayEnabled = $env["PAYSAFE_GOOGLEPAY_ENABLED"].ToLower() -in @("1", "true", "yes")
    }
    $applePayAccountId = if ($env["PAYSAFE_APPLEPAY_ACCOUNT_ID"]) { $env["PAYSAFE_APPLEPAY_ACCOUNT_ID"] } else { $accountId }
    $applePayLabel = if ($env["PAYSAFE_APPLEPAY_LABEL"]) { $env["PAYSAFE_APPLEPAY_LABEL"] } else { "Deposit Demo" }
    $applePayCountry = if ($env["PAYSAFE_APPLEPAY_COUNTRY"]) { $env["PAYSAFE_APPLEPAY_COUNTRY"] } else { "GB" }
    $applePayColor = if ($env["PAYSAFE_APPLEPAY_COLOR"]) { $env["PAYSAFE_APPLEPAY_COLOR"] } else { "white-outline" }
    $applePayType = if ($env["PAYSAFE_APPLEPAY_TYPE"]) { $env["PAYSAFE_APPLEPAY_TYPE"] } else { "buy" }
    $applePaySupportedCountries = @()
    if ($env["PAYSAFE_APPLEPAY_SUPPORTED_COUNTRIES"]) {
        $applePaySupportedCountries = $env["PAYSAFE_APPLEPAY_SUPPORTED_COUNTRIES"].Split(",") | ForEach-Object { $_.Trim().ToUpper() } | Where-Object { $_ -ne "" }
    }
    if ($applePaySupportedCountries.Count -eq 0) {
        $applePaySupportedCountries = @($applePayCountry.ToUpper())
    }
    $applePayEnabled = $false
    if ($env["PAYSAFE_APPLEPAY_ENABLED"]) {
        $applePayEnabled = $env["PAYSAFE_APPLEPAY_ENABLED"].ToLower() -in @("1", "true", "yes")
    }
    $maxWithdrawal = if ($env["PAYSAFE_MAX_WITHDRAWAL"]) { [int]$env["PAYSAFE_MAX_WITHDRAWAL"] } else { 50000 }

    $publicUser = $env["PAYSAFE_PUBLIC_USERNAME"]
    $publicPass = $env["PAYSAFE_PUBLIC_PASSWORD"]
    $privateUser = $env["PAYSAFE_PRIVATE_USERNAME"]
    $privatePass = $env["PAYSAFE_PRIVATE_PASSWORD"]

    $apiKey = $null
    if ($publicUser -and $publicPass) {
        $pair = "{0}:{1}" -f $publicUser, $publicPass
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($pair)
        $apiKey = [Convert]::ToBase64String($bytes)
    }

    $privateAuth = $null
    if ($privateUser -and $privatePass) {
        $pair = "{0}:{1}" -f $privateUser, $privatePass
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($pair)
        $privateAuth = "Basic " + [Convert]::ToBase64String($bytes)
    }

    $apiBase = if ($environment -eq "LIVE") {
        "https://api.paysafe.com"
    } else {
        "https://api.test.paysafe.com"
    }

    return @{
        Port                = $port
        Environment         = $environment
        Currency            = $currency
        AccountId           = $accountId
        GooglePayAccountCc  = $googlePayAccountCc
        GooglePayMerchantId = $googlePayMerchantId
        GooglePayLabel      = $googlePayLabel
        GooglePayCountry    = $googlePayCountry
        GooglePayEnabled    = $googlePayEnabled
        ApplePayAccountId   = $applePayAccountId
        ApplePayLabel       = $applePayLabel
        ApplePayCountry     = $applePayCountry
        ApplePayColor       = $applePayColor
        ApplePayType        = $applePayType
        ApplePaySupportedCountries = $applePaySupportedCountries
        ApplePayEnabled     = $applePayEnabled
        MaxWithdrawal       = $maxWithdrawal
        ApiKey              = $apiKey
        PrivateAuth         = $privateAuth
        ApiBase             = $apiBase
    }
}

function Read-RequestBody {
    param($Request)
    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    $rawBody = $reader.ReadToEnd()
    $reader.Close()
    return $rawBody
}

function Get-CustomerProfiles {
    if (-not (Test-Path $CustomersFile)) {
        return @{}
    }
    try {
        $json = Get-Content $CustomersFile -Raw | ConvertFrom-Json
        $map = @{}
        if ($json) {
            $json.PSObject.Properties | ForEach-Object { $map[$_.Name] = $_.Value }
        }
        return $map
    } catch {
        return @{}
    }
}

function Save-CustomerProfile {
    param([string]$MerchantCustomerId, [string]$CustomerId)

    if (-not (Test-Path $DataDir)) {
        New-Item -ItemType Directory -Path $DataDir | Out-Null
    }

    $profiles = Get-CustomerProfiles
    $profiles[$MerchantCustomerId] = @{
        customerId = $CustomerId
        updatedAt  = (Get-Date).ToUniversalTime().ToString("o")
    }

    $profiles | ConvertTo-Json -Depth 5 | Set-Content $CustomersFile -Encoding UTF8
}

function Get-CustomerProfile {
    param([string]$MerchantCustomerId)
    $profiles = Get-CustomerProfiles
    if ($profiles.ContainsKey($MerchantCustomerId)) {
        return $profiles[$MerchantCustomerId]
    }
    return $null
}

function Invoke-PaysafeApi {
    param(
        [hashtable]$Config,
        [string]$Method,
        [string]$Path,
        [object]$Body = $null
    )

    $uri = "{0}{1}" -f $Config.ApiBase, $Path
    $params = @{
        Uri     = $uri
        Method  = $Method
        Headers = @{
            Authorization  = $Config.PrivateAuth
            "Content-Type" = "application/json"
        }
    }

    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Compress)
    }

    return Invoke-RestMethod @params
}

function Handle-ApiCustomerProfile {
    param($Request, $Response)

    $merchantCustomerId = $Request.QueryString["merchantCustomerId"]
    if (-not $merchantCustomerId) {
        Send-Json -Response $Response -StatusCode 400 -Body @{
            error = "merchantCustomerId query parameter is required."
        }
        return
    }

    $profile = Get-CustomerProfile -MerchantCustomerId $merchantCustomerId
    Send-Json -Response $Response -Body @{
        merchantCustomerId = $merchantCustomerId
        hasProfile         = [bool]$profile
        customerId         = if ($profile) { $profile.customerId } else { $null }
    }
}

function Handle-ApiSingleUseCustomerToken {
    param($Config, $Request, $Response)

    if (-not $Config.PrivateAuth) {
        Send-Json -Response $Response -StatusCode 503 -Body @{
            error = "Paysafe private API credentials are not configured."
        }
        return
    }

    try {
        $body = Read-RequestBody -Request $Request | ConvertFrom-Json
    } catch {
        Send-Json -Response $Response -StatusCode 400 -Body @{ error = "Invalid JSON body." }
        return
    }

    if (-not $body.merchantCustomerId) {
        Send-Json -Response $Response -StatusCode 400 -Body @{
            error = "merchantCustomerId is required."
        }
        return
    }

    $profile = Get-CustomerProfile -MerchantCustomerId $body.merchantCustomerId
    if (-not $profile -or -not $profile.customerId) {
        Send-Json -Response $Response -StatusCode 404 -Body @{
            error = "No Paysafe customer profile found for this merchant customer ID."
        }
        return
    }

    $path = "/paymenthub/v1/customers/{0}/singleusecustomertokens" -f $profile.customerId

    try {
        $result = Invoke-PaysafeApi -Config $Config -Method Post -Path $path -Body @{}

        Send-Json -Response $Response -Body @{
            singleUseCustomerToken = $result.singleUseCustomerToken
            customerId             = $profile.customerId
        }
    } catch {
        $status = 500
        $errorMsg = "Failed to create single-use customer token."

        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errorBody = $reader.ReadToEnd()
            $reader.Close()
            try {
                $details = $errorBody | ConvertFrom-Json
                if ($details.message) { $errorMsg = $details.message }
            } catch {
                $errorMsg = $errorBody
            }
        }

        Send-Json -Response $Response -StatusCode $status -Body @{ error = $errorMsg }
    }
}

function Send-Json {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [object]$Body,
        [int]$StatusCode = 200
    )
    $json = $Body | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Response.StatusCode = $StatusCode
    $Response.ContentType = "application/json; charset=utf-8"
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

function Get-MimeType {
    param([string]$Path)
    switch ([System.IO.Path]::GetExtension($Path).ToLower()) {
        ".html" { return "text/html; charset=utf-8" }
        ".css"  { return "text/css; charset=utf-8" }
        ".js"   { return "application/javascript; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".png"  { return "image/png" }
        ".jpg"  { return "image/jpeg" }
        ".svg"  { return "image/svg+xml" }
        default { return "application/octet-stream" }
    }
}

function Send-File {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [string]$FilePath
    )
    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
    $Response.StatusCode = 200
    $Response.ContentType = Get-MimeType -Path $FilePath
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

function Handle-ApiConfig {
    param($Config, $Response)
    if (-not $Config.ApiKey) {
        Send-Json -Response $Response -StatusCode 503 -Body @{
            error = "Paysafe public API credentials are not configured. Copy .env.example to .env and add your keys."
        }
        return
    }
    Send-Json -Response $Response -Body @{
        apiKey              = $Config.ApiKey
        environment         = $Config.Environment
        currency            = $Config.Currency
        accountId           = $Config.AccountId
        maxWithdrawalAmount = $Config.MaxWithdrawal
        googlePay           = @{
            enabled    = $Config.GooglePayEnabled
            merchantId = $Config.GooglePayMerchantId
            label      = $Config.GooglePayLabel
            country    = $Config.GooglePayCountry
            accountCc  = $Config.GooglePayAccountCc
            color      = "black"
            type       = "pay"
        }
        applePay            = @{
            enabled            = $Config.ApplePayEnabled
            accountId          = $Config.ApplePayAccountId
            label              = $Config.ApplePayLabel
            country            = $Config.ApplePayCountry
            color              = $Config.ApplePayColor
            type               = $Config.ApplePayType
            supportedCountries = $Config.ApplePaySupportedCountries
        }
    }
}

function Handle-ApiHealth {
    param($Config, $Response)
    Send-Json -Response $Response -Body @{
        status      = "ok"
        environment = $Config.Environment
        configured  = [bool]($Config.ApiKey -and $Config.PrivateAuth)
    }
}

function Handle-ApiProcessPayment {
    param($Config, $Request, $Response)

    if (-not $Config.PrivateAuth) {
        Send-Json -Response $Response -StatusCode 503 -Body @{
            error = "Paysafe private API credentials are not configured."
        }
        return
    }

    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    $rawBody = $reader.ReadToEnd()
    $reader.Close()

    try {
        $body = $rawBody | ConvertFrom-Json
    } catch {
        Send-Json -Response $Response -StatusCode 400 -Body @{ error = "Invalid JSON body." }
        return
    }

    if (-not $body.paymentHandleToken -or -not $body.amount -or -not $body.merchantRefNum) {
        Send-Json -Response $Response -StatusCode 400 -Body @{
            error = "paymentHandleToken, amount, and merchantRefNum are required."
        }
        return
    }

    $payload = @{
        merchantRefNum     = [string]$body.merchantRefNum
        amount             = [int]$body.amount
        currencyCode       = $Config.Currency
        paymentHandleToken = [string]$body.paymentHandleToken
        settleWithAuth     = $true
        dupCheck           = $true
        description        = "Deposit Demo - Checkout payment"
    }

    if ($body.customerOperation -eq "ADD" -and $body.merchantCustomerId) {
        $existingProfile = Get-CustomerProfile -MerchantCustomerId $body.merchantCustomerId
        if (-not $existingProfile) {
            $payload.merchantCustomerId = [string]$body.merchantCustomerId
        }
    }

    $uri = "{0}/paymenthub/v1/payments" -f $Config.ApiBase
    $jsonPayload = $payload | ConvertTo-Json -Compress

    try {
        $result = Invoke-RestMethod -Uri $uri -Method Post `
            -Headers @{
                Authorization  = $Config.PrivateAuth
                "Content-Type" = "application/json"
            } `
            -Body $jsonPayload

        if ($result.customerId -and $body.merchantCustomerId) {
            Save-CustomerProfile -MerchantCustomerId $body.merchantCustomerId -CustomerId $result.customerId
        }

        Send-Json -Response $Response -Body @{
            success                    = $true
            payment                    = $result
            paymentMethod              = $body.paymentMethod
            customerId                 = $result.customerId
            multiUsePaymentHandleToken = $result.multiUsePaymentHandleToken
            cardSaved                  = ($body.customerOperation -eq "ADD")
        }
    } catch {
        $status = 500
        $errorMsg = "Payment processing failed."
        $details = $null

        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errorBody = $reader.ReadToEnd()
            $reader.Close()
            try {
                $details = $errorBody | ConvertFrom-Json
                if ($details.message) { $errorMsg = $details.message }
                elseif ($details.error.message) { $errorMsg = $details.error.message }
            } catch {
                $errorMsg = $errorBody
            }
        }

        Send-Json -Response $Response -StatusCode $status -Body @{
            error         = $errorMsg
            details       = $details
            paymentMethod = $body.paymentMethod
        }
    }
}

function Handle-ApiProcessWithdrawal {
    param($Config, $Request, $Response)

    if (-not $Config.PrivateAuth) {
        Send-Json -Response $Response -StatusCode 503 -Body @{
            error = "Paysafe private API credentials are not configured."
        }
        return
    }

    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    $rawBody = $reader.ReadToEnd()
    $reader.Close()

    try {
        $body = $rawBody | ConvertFrom-Json
    } catch {
        Send-Json -Response $Response -StatusCode 400 -Body @{ error = "Invalid JSON body." }
        return
    }

    if (-not $body.paymentHandleToken -or -not $body.amount -or -not $body.merchantRefNum) {
        Send-Json -Response $Response -StatusCode 400 -Body @{
            error = "paymentHandleToken, amount, and merchantRefNum are required."
        }
        return
    }

    $payload = @{
        merchantRefNum     = [string]$body.merchantRefNum
        amount             = [int]$body.amount
        currencyCode       = $Config.Currency
        paymentHandleToken = [string]$body.paymentHandleToken
        dupCheck           = $true
        description        = "Deposit Demo - Checkout withdrawal"
    }

    $apiPath = if ($body.transactionType -eq "ORIGINAL_CREDIT") {
        "/paymenthub/v1/originalcredits"
    } else {
        "/paymenthub/v1/standalonecredits"
    }

    $uri = "{0}{1}" -f $Config.ApiBase, $apiPath
    $jsonPayload = $payload | ConvertTo-Json -Compress

    try {
        $result = Invoke-RestMethod -Uri $uri -Method Post `
            -Headers @{
                Authorization  = $Config.PrivateAuth
                "Content-Type" = "application/json"
            } `
            -Body $jsonPayload

        Send-Json -Response $Response -Body @{
            success         = $true
            withdrawal      = $result
            paymentMethod   = $body.paymentMethod
            transactionType = $body.transactionType
        }
    } catch {
        $status = 500
        $errorMsg = "Withdrawal processing failed."
        $details = $null

        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errorBody = $reader.ReadToEnd()
            $reader.Close()
            try {
                $details = $errorBody | ConvertFrom-Json
                if ($details.message) { $errorMsg = $details.message }
                elseif ($details.error.message) { $errorMsg = $details.error.message }
            } catch {
                $errorMsg = $errorBody
            }
        }

        Send-Json -Response $Response -StatusCode $status -Body @{
            error         = $errorMsg
            details       = $details
            paymentMethod = $body.paymentMethod
        }
    }
}

$config = Get-Config
$port = $config.Port
$prefix = "http://localhost:$port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "Deposit Demo running at $prefix" -ForegroundColor Green
Write-Host "Paysafe environment: $($config.Environment)" -ForegroundColor Cyan
if (-not $config.ApiKey -or -not $config.PrivateAuth) {
    Write-Host "Warning: Paysafe API credentials not set. Copy .env.example to .env" -ForegroundColor Yellow
}
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        try {
            $path = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)

            if ($path -eq "/api/config" -and $request.HttpMethod -eq "GET") {
                Handle-ApiConfig -Config $config -Response $response
                continue
            }

            if ($path -eq "/api/health" -and $request.HttpMethod -eq "GET") {
                Handle-ApiHealth -Config $config -Response $response
                continue
            }

            if ($path -eq "/api/process-payment" -and $request.HttpMethod -eq "POST") {
                Handle-ApiProcessPayment -Config $config -Request $request -Response $response
                continue
            }

            if ($path -eq "/api/process-withdrawal" -and $request.HttpMethod -eq "POST") {
                Handle-ApiProcessWithdrawal -Config $config -Request $request -Response $response
                continue
            }

            if ($path -eq "/api/customer-profile" -and $request.HttpMethod -eq "GET") {
                Handle-ApiCustomerProfile -Request $request -Response $response
                continue
            }

            if ($path -eq "/api/single-use-customer-token" -and $request.HttpMethod -eq "POST") {
                Handle-ApiSingleUseCustomerToken -Config $config -Request $request -Response $response
                continue
            }

            if ($path -eq "/") {
                $path = "/index.html"
            }

            $relative = $path.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
            $filePath = Join-Path $PublicDir $relative
            $resolved = [System.IO.Path]::GetFullPath($filePath)
            $publicResolved = [System.IO.Path]::GetFullPath($PublicDir)

            if (-not $resolved.StartsWith($publicResolved) -or -not (Test-Path $resolved -PathType Leaf)) {
                $response.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
                $response.ContentType = "text/plain"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.OutputStream.Close()
                continue
            }

            Send-File -Response $response -FilePath $resolved
        } catch {
            Write-Host "Request error: $_" -ForegroundColor Red
            try {
                $response.StatusCode = 500
                $response.OutputStream.Close()
            } catch { }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}

