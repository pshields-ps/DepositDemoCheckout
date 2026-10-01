async function invokePaysafeApi(config, method, apiPath, body = null) {
  const uri = `${config.apiBase}${apiPath}`;
  const options = {
    method,
    headers: {
      Authorization: config.privateAuth,
      "Content-Type": "application/json",
    },
  };

  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(uri, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const error = new Error(
      data?.message ||
        data?.error?.message ||
        text ||
        `Paysafe API error (${response.status})`
    );
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

module.exports = { invokePaysafeApi };
