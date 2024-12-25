const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

router.get("/all-notifications", checkAuth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    if (!userId) {
      return res.status(400).json(createResponse(false, "User ID is required"));
    }

    const notificationsRef = admin.firestore().collection("notifications");
    const globalNotificationsSnapshot = await notificationsRef
      .where("isGlobal", "==", true)
      .get();
    const userNotificationsSnapshot = await notificationsRef
      .where("userID", "==", userId)
      .get();

    const notifications = [];

    globalNotificationsSnapshot.forEach((doc) => {
      notifications.push({ id: doc.id, ...doc.data() });
    });

    userNotificationsSnapshot.forEach((doc) => {
      notifications.push({ id: doc.id, ...doc.data() });
    });

    return res
      .status(200)
      .json(
        createResponse(
          true,
          "Notifications fetched successfully",
          notifications
        )
      );
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json(createResponse(false, "Internal Server Error"));
  }
});

// TODO : remove notification from db
router.delete("/delete-notification/:id", checkAuth, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.user_id;

    if (!notificationId) {
      return res
        .status(400)
        .json(createResponse(false, "Notification ID is required"));
    }

    const notificationRef = admin
      .firestore()
      .collection("notifications")
      .doc(notificationId);
    const notificationDoc = await notificationRef.get();

    if (!notificationDoc.exists) {
      return res
        .status(404)
        .json(createResponse(false, "Notification not found"));
    }

    if (notificationDoc.data().userID !== userId) {
      return res
        .status(403)
        .json(
          createResponse(false, "Unauthorized to delete this notification")
        );
    }

    await notificationRef.delete();

    return res
      .status(200)
      .json(createResponse(true, "Notification deleted successfully"));
  } catch (error) {
    console.error("Error deleting notification:", error);
    return res.status(500).json(createResponse(false, "Internal Server Error"));
  }
});

module.exports = router;
