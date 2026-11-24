exports.allowed = value => typeof value==='string' && /^http:\/\/127\.0\.0\.1:(8789|9299|5001)\//.test(value);
