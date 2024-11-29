const express = require('express');
const admin = require('firebase-admin');
const checkAuth = require('../../middleware/authentication');

// Add a new asset to the user (requires authentication)
const router = express.Router();

// Add a new asset to the user (requires authentication)
router.post('/user/assets', checkAuth, (req, res) => {
  const { buildingId, isCreated, isForbidden, isRotate, isDestroyed, x, y } =
    req.body;
  console.log('HELLO', req.body);
  if (
    buildingId === undefined ||
    isCreated === undefined ||
    isForbidden === undefined ||
    isRotate === undefined ||
    isDestroyed === undefined ||
    x === undefined ||
    y === undefined
  ) {
    return res
      .status(500)
      .json({ message: 'All fields are required', success: false });
  }

  const db = admin.firestore();
  const assetRef = db.collection('userAssets').doc();

  const data = {
    buildingId,
    isCreated,
    isForbidden,
    isRotate,
    isDestroyed,
    x,
    y,
    userId: req.user.user_id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  assetRef
    .set(data)
    .then(() => {
      return res.json({ message: 'Asset added to user', success: true });
    })
    .catch((error) => {
      console.error('Error adding asset:', error);
      return res.status(500).json({ message: error.message, success: false });
    });
});

// Get all assets for the authenticated user
router.get('/user/assets', checkAuth, (req, res) => {
  const db = admin.firestore();
  const assetsRef = db.collection('userAssets');

  assetsRef
    .where('userId', '==', req.user.user_id)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        return res
          .status(404)
          .json({ message: 'No assets found', success: false });
      }

      const assets = [];
      snapshot.forEach((doc) => {
        assets.push({ id: doc.id, ...doc.data() });
      });

      return res.json({ assets, success: true });
    })
    .catch((error) => {
      console.error('Error getting assets:', error);
      return res.status(500).json({ message: error.message, success: false });
    });
});

// Delete a specific asset for the authenticated user
router.delete('/user/assets', checkAuth, (req, res) => {
  const { buildingId, x, y } = req.body;

  // Have provided the x, y too as the direction is same across backend and frontend

  if (buildingId === undefined || x === undefined || y === undefined) {
    return res
      .status(500)
      .json({ message: 'All fields are required', success: false });
  }

  const db = admin.firestore();
  const assetsRef = db.collection('userAssets');

  assetsRef
    .where('userId', '==', req.user.user_id)
    .where('buildingId', '==', buildingId)
    .where('x', '==', x)
    .where('y', '==', y)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        return res
          .status(404)
          .json({ message: 'Asset not found', success: false });
      }

      const batch = db.batch();
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      return batch.commit();
    })
    .then(() => {
      return res.json({ message: 'Asset deleted', success: true });
    })
    .catch((error) => {
      console.error('Error deleting asset:', error);
      return res.status(500).json({ message: error.message, success: false });
    });
});

module.exports = router;
