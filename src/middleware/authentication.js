const admin = require('firebase-admin');

// Middleware to check if the user is authenticated
const checkAuth = async (req, res, next) => {
  const authToken = req.headers.authorization?.split('Bearer ')[1];

  if (!authToken) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(authToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(403).json({ error: 'Unauthorized' });
  }
};

module.exports = checkAuth;
