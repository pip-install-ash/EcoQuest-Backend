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
    const [globalNotificationsSnapshot, userNotificationsSnapshot] =
      await Promise.all([
        notificationsRef.where("isGlobal", "==", true).get(),
        notificationsRef.where("userID", "==", userId).get(),
      ]);

    const notifications = [];
    let disasterCount = 0;
    const disasterMessage =
      "There have been a disaster! Run back to your city and save your civilians";

    const calculateTimeAgo = (date) => {
      const diff = new Date() - date;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days} day(s) ago`;
      if (hours > 0) return `${hours} hour(s) ago`;
      if (minutes > 0) return `${minutes} minute(s) ago`;
      return "Just now";
    };

    const formatResourcesReceivedMessage = (message) => {
      const match = message.match(
        /Resources received: (\d+) GOLD, (\d+)KW, (\d+) LITER, from (.+)/
      );
      return match
        ? `Resource received : <span style='color: #E99A45;'>+${match[1]} gold</span>, <span style='color: #1e90ff;'>+${match[2]}KW</span>, ${match[3]} LITER, from<br>(${match[4]})`
        : message;
    };

    const processNotifications = (snapshot) => {
      snapshot.forEach((doc) => {
        const data = doc.data();
        const { notificationType, message, createdAt } = data;

        if (notificationType === "disaster" && message === disasterMessage) {
          disasterCount++;
          return;
        }

        if (notificationType === "challenge" && !isToday(createdAt)) {
          return;
        }

        notifications.push({
          notificationType,
          message:
            notificationType === "challenge"
              ? "New echo challenge: Complete the challenge to get <span style='color: #10EE1A;'>+20 coins</span> reward."
              : notificationType === "resourcesReceived"
              ? formatResourcesReceivedMessage(message)
              : message,
          time: calculateTimeAgo(new Date(createdAt)),
        });
      });
    };

    const isToday = (date) => {
      const today = new Date();
      const notificationDate = new Date(date);
      return (
        today.getDate() === notificationDate.getDate() &&
        today.getMonth() === notificationDate.getMonth() &&
        today.getFullYear() === notificationDate.getFullYear()
      );
    };

    processNotifications(globalNotificationsSnapshot);
    processNotifications(userNotificationsSnapshot);

    if (disasterCount > 0) {
      notifications.unshift({
        notificationType: "disaster",
        message: `There have been disasters! (${disasterCount} occurrences in the last 7 days)`,
        time: "Last 7 days",
      });
    }

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
