const createResponse = (success, message, data = null) => {
  return {
    success: success,
    message: message,
    data: data,
  };
};

module.exports = createResponse;
