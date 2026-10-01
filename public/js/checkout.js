(function () {
  'use strict';

  let config = null;
  let selectedAmountMinor = 2500;
  let customerProfile = null;
  let transactionType = 'deposit';

  const form = document.getElementById('deposit-form');
  const checkoutBtn = document.getElementById('checkout-btn');
  const configAlert = document.getElementById('config-alert');
  const errorAlert = document.getElementById('error-alert');
  const amountOptions = document.getElementById('amount-options');
  const transactionOptions = document.getElementById('transaction-options');
  const customAmountInput = document.getElementById('customAmount');
  const summaryAmount = document.getElementById('summary-amount');
  const summaryTotal = document.getElementById('summary-total');
  const summaryCurrency = document.getElementById('summary-currency');
  const summaryEnvironment = document.getElementById('summary-environment');
  const summaryTransactionType = document.getElementById('summary-transaction-type');
  const savedCardsStatus = document.getElementById('saved-cards-status');
  const summaryCustomerId = document.getElementById('summary-customer-id');
  const loggedInEmail = document.getElementById('logged-in-email');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const formSectionTitle = document.getElementById('form-section-title');

  let userSession = null;

  function showAlert(el, message) {
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function hideAlert(el) {
    el.classList.add('hidden');
  }

  function isWithdrawal() {
    return transactionType === 'withdrawal';
  }

  function formatMoney(minorUnits) {
    const locale = config?.currency === 'GBP' ? 'en-GB' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: config?.currency || 'GBP',
    }).format(minorUnits / 100);
  }

  function updateSummary() {
    const formatted = formatMoney(selectedAmountMinor);
    summaryAmount.textContent = formatted;
    summaryTotal.textContent = formatted;
  }

  function updateTransactionUI() {
    const withdrawal = isWithdrawal();

    if (pageTitle) {
      pageTitle.textContent = withdrawal ? 'Make a withdrawal' : 'Make a deposit';
    }

    if (formSectionTitle) {
      formSectionTitle.textContent = withdrawal ? 'Withdrawal details' : 'Deposit details';
    }

    if (summaryTransactionType) {
      summaryTransactionType.textContent = withdrawal ? 'Withdrawal' : 'Deposit';
    }

    if (checkoutBtn) {
      checkoutBtn.textContent = withdrawal ? 'Withdraw Now' : 'Deposit Now';
    }
  }

  function dollarsToMinorUnits(dollars) {
    return Math.round(Number(dollars) * 100);
  }

  function generateMerchantRefNum() {
    const prefix = isWithdrawal() ? 'wd-' : 'dep-';
    if (crypto.randomUUID) {
      return prefix + crypto.randomUUID();
    }
    return prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function getMerchantCustomerId() {
    return userSession ? userSession.merchantCustomerId : '';
  }

  function applySession(session) {
    document.getElementById('firstName').value = session.firstName;
    document.getElementById('lastName').value = session.lastName;
    document.getElementById('email').value = session.email;

    const nickNameField = document.getElementById('billingNickName');
    if (nickNameField) {
      nickNameField.value = session.firstName + ' ' + session.lastName;
    }

    if (loggedInEmail) {
      loggedInEmail.textContent = session.email;
    }

    if (summaryCustomerId) {
      summaryCustomerId.textContent = session.merchantCustomerId;
    }
  }

  function getBillingAddressFromForm() {
    const billingAddress = {
      street: document.getElementById('billingStreet').value.trim(),
      city: document.getElementById('billingCity').value.trim(),
      zip: document.getElementById('billingZip').value.trim(),
      country: document.getElementById('billingCountry').value.trim().toUpperCase(),
    };

    const nickName = document.getElementById('billingNickName').value.trim();
    if (nickName) {
      billingAddress.nickName = nickName;
    }

    return billingAddress;
  }

  function getCustomerFromForm() {
    const customer = {
      firstName: document.getElementById('firstName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      email: document.getElementById('email').value.trim(),
    };

    const merchantCustomerId = getMerchantCustomerId();
    if (merchantCustomerId && !customerProfile?.hasProfile && !isWithdrawal()) {
      customer.merchantCustomerId = merchantCustomerId;
    }

    return customer;
  }

  function updateSavedCardsStatus() {
    if (!savedCardsStatus) return;

    if (customerProfile?.hasProfile) {
      savedCardsStatus.textContent = isWithdrawal()
        ? 'Saved payout methods available for this customer.'
        : 'Saved cards and addresses available for this customer.';
      savedCardsStatus.classList.remove('hidden');
    } else {
      savedCardsStatus.textContent = isWithdrawal()
        ? 'No saved profile yet. Complete a deposit and save a card first.'
        : 'No saved profile yet. Tick "Save my card" in Checkout to store card and address after payment.';
      savedCardsStatus.classList.remove('hidden');
    }
  }

  async function loadCustomerProfile() {
    const merchantCustomerId = getMerchantCustomerId();
    if (!merchantCustomerId) {
      customerProfile = null;
      updateSavedCardsStatus();
      return;
    }

    try {
      const response = await fetch(
        '/api/customer-profile?merchantCustomerId=' + encodeURIComponent(merchantCustomerId)
      );
      const data = await response.json();
      customerProfile = response.ok ? data : null;
    } catch (err) {
      console.error('Failed to load customer profile:', err);
      customerProfile = null;
    }

    updateSavedCardsStatus();
  }

  async function fetchSingleUseCustomerToken(merchantCustomerId) {
    const response = await fetch('/api/single-use-customer-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantCustomerId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Could not load saved cards.');
    }

    return data;
  }

  function validateForm() {
    if (!form.checkValidity()) {
      form.reportValidity();
      return false;
    }

    if (!getMerchantCustomerId()) {
      showAlert(errorAlert, 'You must be signed in to continue.');
      return false;
    }

    if (selectedAmountMinor < 1 || selectedAmountMinor > 999999999) {
      showAlert(errorAlert, 'Please enter a valid amount.');
      return false;
    }

    const maxWithdrawal = config?.maxWithdrawalAmount || 50000;
    if (isWithdrawal() && selectedAmountMinor > maxWithdrawal) {
      showAlert(
        errorAlert,
        'Withdrawal amount exceeds the maximum of ' + formatMoney(maxWithdrawal) + '.'
      );
      return false;
    }

    hideAlert(errorAlert);
    return true;
  }

  async function processDepositOnServer(result, merchantRefNum) {
    const merchantCustomerId = getMerchantCustomerId();
    const response = await fetch('/api/process-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentHandleToken: result.paymentHandleToken,
        amount: result.amount || selectedAmountMinor,
        merchantRefNum,
        paymentMethod: result.paymentMethod,
        customerOperation: result.customerOperation,
        merchantCustomerId,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Payment processing failed.');
    }

    if (data.customerId) {
      customerProfile = {
        merchantCustomerId,
        hasProfile: true,
        customerId: data.customerId,
      };
      updateSavedCardsStatus();
    }

    return data;
  }

  async function processWithdrawalOnServer(result, merchantRefNum) {
    const response = await fetch('/api/process-withdrawal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentHandleToken: result.paymentHandleToken,
        amount: result.amount || selectedAmountMinor,
        merchantRefNum,
        paymentMethod: result.paymentMethod,
        transactionType: result.transactionType || 'STANDALONE_CREDIT',
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Withdrawal processing failed.');
    }

    return data;
  }

  function buildCheckoutOptions(merchantRefNum, customer) {
    const withdrawal = isWithdrawal();
    const maxWithdrawal = config?.maxWithdrawalAmount || 50000;
    const googlePayConfig = config?.googlePay || null;
    const applePayConfig = config?.applePay || null;

    const options = {
      amount: selectedAmountMinor,
      currency: config.currency,
      merchantRefNum,
      customer,
      environment: config.environment,
      canEditAmount: false,
      locale: 'en_US',
      headerText: withdrawal
        ? 'Make Secure Withdrawals with Checkout'
        : 'Make Secure Payments with Checkout',
      footerText: 'For additional info please contact us at support@paysafe.com',
      paymentMethodDetails: {
        card: {
          accountId: Number(config.accountId),
        },
      },
      billingAddress: getBillingAddressFromForm(),
      threeDs: {
        merchantUrl: window.location.origin + '/',
        deviceChannel: 'BROWSER',
        messageCategory: 'PAYMENT',
        authenticationPurpose: 'PAYMENT_TRANSACTION',
        transactionIntent: 'GOODS_OR_SERVICE_PURCHASE',
      },
    };

    if (!withdrawal) {
      const displayMethods = [];

      if (applePayConfig?.enabled) {
        const applePay = {
          label: applePayConfig.label || 'Pay With Apple Pay',
          country: (applePayConfig.country || 'GB').toUpperCase(),
          type: applePayConfig.type || 'buy',
          color: applePayConfig.color || 'white-outline',
          requiredBillingContactFields: ['email', 'postalAddress'],
        };

        if (applePayConfig.accountId || config.accountId) {
          applePay.accountId = Number(applePayConfig.accountId || config.accountId);
        }

        if (applePayConfig.supportedCountries?.length) {
          applePay.supportedCountries = applePayConfig.supportedCountries.map(function (code) {
            return String(code).toUpperCase();
          });
        }

        options.paymentMethodDetails.applePay = applePay;
        displayMethods.push('applePay');
      }

      if (googlePayConfig?.enabled && googlePayConfig?.merchantId) {
        options.paymentMethodDetails.googlePay = {
          accounts: {
            CC: Number(googlePayConfig.accountCc || config.accountId),
          },
          type: googlePayConfig.type || 'pay',
          color: googlePayConfig.color || 'black',
          requiredBillingContactFields: ['email', 'postalAddress'],
          merchantId: googlePayConfig.merchantId,
          label: googlePayConfig.label || 'Deposit Demo',
          country: (googlePayConfig.country || 'GB').toUpperCase(),
        };
        displayMethods.push('googlePay');
      }

      displayMethods.push('card');

      if (displayMethods.length > 1) {
        options.displayPaymentMethods = displayMethods;
      }

      if (config.environment === 'TEST' && applePayConfig?.enabled) {
        options.simulator = 'EXTERNAL';
      }
    }

    if (withdrawal) {
      options.payout = true;
      options.payoutConfig = {
        maximumAmount: maxWithdrawal,
      };
      options.displayPaymentMethods = ['card', 'skrill', 'neteller', 'PaysafeCard', 'paypal'];
    }

    return options;
  }

  async function launchCheckout() {
    if (!config || typeof paysafe === 'undefined') {
      showAlert(errorAlert, 'Paysafe Checkout is not available. Check your configuration.');
      return;
    }

    if (!validateForm()) return;

    await loadCustomerProfile();

    const merchantRefNum = generateMerchantRefNum();
    const customer = getCustomerFromForm();
    const options = buildCheckoutOptions(merchantRefNum, customer);

    if (customerProfile?.hasProfile) {
      try {
        const tokenData = await fetchSingleUseCustomerToken(getMerchantCustomerId());
        options.singleUseCustomerToken = tokenData.singleUseCustomerToken;
      } catch (err) {
        console.error('Single-use token error:', err);
        if (isWithdrawal()) {
          showAlert(errorAlert, err.message);
          return;
        }
      }
    }

    checkoutBtn.disabled = true;

    paysafe.checkout.setup(
      config.apiKey,
      options,

      async function resultCallback(instance, error, result) {
        if (result && result.paymentHandleToken) {
          try {
            const amount = result.amount || selectedAmountMinor;

            if (isWithdrawal()) {
              await processWithdrawalOnServer(result, merchantRefNum);
              instance.showSuccessScreen(
                'Your withdrawal of ' +
                  formatMoney(amount) +
                  ' was successful. Funds will be sent to your selected payout method.'
              );
            } else {
              const paymentResult = await processDepositOnServer(result, merchantRefNum);
              let successMessage =
                'Your deposit of ' + formatMoney(amount) + ' was successful. Funds will appear in your account shortly.';

              if (paymentResult.cardSaved) {
                successMessage += ' Your card and address have been saved for future transactions.';
              }

              instance.showSuccessScreen(successMessage);
            }
          } catch (err) {
            console.error('Server transaction error:', err);
            instance.showFailureScreen(
              err.message ||
                'The transaction could not be completed. Please try again with the same or another payment method.'
            );
          }
        } else {
          console.error('Checkout tokenization error:', error);
          if (instance) {
            const code = error && error.code;
            let message =
              (error && (error.displayMessage || error.message)) ||
              'The transaction was declined. Please try again with the same or another payment method.';

            if (code === '9070') {
              message =
                'Checkout could not load (9070). Try disabling ad blockers, allow third-party cookies for this site, or use a regular card payment. If Apple Pay or Google Pay is enabled, confirm your wallet settings are configured in the Paysafe Business Portal.';
            }

            instance.showFailureScreen(message);
          }
        }

        checkoutBtn.disabled = false;
      },

      function closeCallback(stage, expired) {
        checkoutBtn.disabled = false;
        if (expired) {
          showAlert(errorAlert, 'The checkout session expired. Please try again.');
        }
        console.log('Checkout closed at stage:', stage);
      },

      function riskCallback(instance, amount, paymentMethod) {
        console.log('Risk check — amount:', amount, 'method:', paymentMethod);
        instance.accept();
      }
    );
  }

  amountOptions.addEventListener('click', function (e) {
    const btn = e.target.closest('.amount-option');
    if (!btn) return;

    amountOptions.querySelectorAll('.amount-option').forEach(function (el) {
      el.classList.remove('selected');
    });
    btn.classList.add('selected');
    customAmountInput.value = '';

    selectedAmountMinor = Number(btn.dataset.amount);
    updateSummary();
  });

  transactionOptions.addEventListener('click', function (e) {
    const btn = e.target.closest('.transaction-option');
    if (!btn) return;

    transactionOptions.querySelectorAll('.transaction-option').forEach(function (el) {
      el.classList.remove('selected');
    });
    btn.classList.add('selected');

    transactionType = btn.dataset.type;
    updateTransactionUI();
    updateSavedCardsStatus();
  });

  customAmountInput.addEventListener('input', function () {
    if (!customAmountInput.value) return;

    amountOptions.querySelectorAll('.amount-option').forEach(function (el) {
      el.classList.remove('selected');
    });

    selectedAmountMinor = dollarsToMinorUnits(customAmountInput.value);
    updateSummary();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    launchCheckout();
  });

  async function init() {
    userSession = DepositAuth.requireAuth('/deposit.html');
    if (!userSession) return;

    DepositAuth.initNav();
    applySession(userSession);
    updateTransactionUI();

    try {
      const response = await fetch('/api/config');
      const data = await response.json();

      if (!response.ok) {
        showAlert(configAlert, data.error);
        return;
      }

      config = data;
      summaryCurrency.textContent = config.currency;
      summaryEnvironment.textContent = config.environment;
      checkoutBtn.disabled = false;
      updateSummary();
      await loadCustomerProfile();

      if (config.environment === 'TEST') {
        let testMessage =
          'Running in TEST mode. Use Paysafe test card details from your Business Portal.';
        if (config.applePay?.enabled) {
          testMessage +=
            ' Apple Pay is enabled — use the Paysafe sandbox simulator or scan the QR code with an iPhone on iOS 18+.';
        }
        showAlert(configAlert, testMessage);
      }
    } catch (err) {
      showAlert(configAlert, 'Unable to load Paysafe configuration. Is the server running?');
      console.error(err);
    }
  }

  init();
})();
