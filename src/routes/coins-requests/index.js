const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

router.post("/request-coins", checkAuth, async (req, res) => {
  const userID = req.user.user_id;
  const { leagueID, coinsRequested } = req.body;

  if (
    !leagueID ||
    !userID ||
    !coinsRequested ||
    typeof coinsRequested !== "object" ||
    !coinsRequested.electricity ||
    !coinsRequested.water ||
    !coinsRequested.money
  ) {
    return res
      .status(400)
      .json(createResponse(false, "Missing or invalid required fields"));
  }

  try {
    const newRequest = {
      leagueID,
      userID,
      coinsRequested,
      isAccepted: false,
      createdAt: new Date().toISOString(),
    };

    const docRef = await admin
      .firestore()
      .collection("coinsRequests")
      .add(newRequest);
    const createdRequest = { id: docRef.id, ...newRequest };

    return res
      .status(201)
      .json(
        createResponse(true, "Request created successfully", createdRequest)
      );
  } catch (error) {
    console.error("Error creating request:", error);
    return res.status(500).json(createResponse(false, "Internal server error"));
  }
});

router.post("/send-coins/:coinsRequestID", checkAuth, async (req, res) => {
  const senderID = req.user.user_id;
  const { coinsRequestID } = req.params;
  const { electricity, water, coins } = req.body;

  if (
    !coinsRequestID ||
    electricity == null ||
    water == null ||
    coins == null
  ) {
    return res
      .status(400)
      .json(createResponse(false, "Missing required fields"));
  }

  const coinsRequestDoc = await admin
    .firestore()
    .collection("coinsRequests")
    .doc(coinsRequestID)
    .get();

  if (!coinsRequestDoc.exists) {
    return res
      .status(404)
      .json(createResponse(false, "Coins request not found"));
  }

  const requestData = coinsRequestDoc.data();
  const requestingUserID = requestData.userID;
  const leagueID = requestData.leagueID;

  if (requestData.isAccepted) {
    return res
      .status(400)
      .json(createResponse(false, "Request already accepted"));
  }

  try {
    // Fetch requesting user's league stats
    const requestingUserSnapshot = await admin
      .firestore()
      .collection("leagueStats")
      .where("userId", "==", requestingUserID)
      .where("leagueId", "==", leagueID)
      .get();

    if (requestingUserSnapshot.empty) {
      return res
        .status(404)
        .json(
          createResponse(false, "Requesting user's league stats not found")
        );
    }

    // Fetch sender's league assets
    const senderUserSnapshot = await admin
      .firestore()
      .collection("leagueStats")
      .where("userId", "==", senderID)
      .where("leagueId", "==", leagueID)
      .get();

    if (senderUserSnapshot.empty) {
      return res
        .status(404)
        .json(createResponse(false, "Sender's league stats not found"));
    }

    const requestingUserDoc = requestingUserSnapshot.docs[0];
    const senderUserDoc = senderUserSnapshot.docs[0];

    const senderUserData = senderUserDoc.data();

    if (
      typeof senderUserData.electricity !== "number" ||
      typeof senderUserData.water !== "number" ||
      typeof senderUserData.coins !== "number" ||
      senderUserData.electricity < electricity ||
      senderUserData.water < water ||
      senderUserData.coins < coins
    ) {
      return res
        .status(400)
        .json(createResponse(false, "Sender does not have enough resources"));
    }

    // Update the requesting user's resources
    await requestingUserDoc.ref.update({
      electricity: admin.firestore.FieldValue.increment(electricity),
      water: admin.firestore.FieldValue.increment(water),
      coins: admin.firestore.FieldValue.increment(coins),
    });

    // Update the sender's resources
    await senderUserDoc.ref.update({
      electricity: admin.firestore.FieldValue.increment(-electricity),
      water: admin.firestore.FieldValue.increment(-water),
      coins: admin.firestore.FieldValue.increment(-coins),
    });

    // Deduct the requested resources from the coinsRequestDoc
    const updatedElectricity =
      requestData.coinsRequested.electricity - electricity;
    const updatedWater = requestData.coinsRequested.water - water;
    const updatedCoins = requestData.coinsRequested.money - coins;

    const isAccepted =
      updatedElectricity <= 0 && updatedWater <= 0 && updatedCoins <= 0;

    await coinsRequestDoc.ref.update({
      "coinsRequested.electricity": updatedElectricity,
      "coinsRequested.water": updatedWater,
      "coinsRequested.money": updatedCoins,
      isAccepted,
    });

    // Fetch sender's user profile to get the user name
    const senderProfileSnapshot = await admin
      .firestore()
      .collection("userProfiles")
      .doc(senderID)
      .get();

    if (!senderProfileSnapshot.exists) {
      return res
        .status(404)
        .json(createResponse(false, "Sender's user profile not found"));
    }

    const senderProfileData = senderProfileSnapshot.data();
    const senderName = senderProfileData.userName;

    // Create the notification document
    const notificationDoc = {
      message: `Resources received: ${coins} GOLD, ${electricity}KW, ${water} LITER, from ${senderName}`,
      notificationType: "resourcesReceived",
      isGlobal: false,
      userID: requestingUserID,
      createdAt: new Date().toISOString(),
    };
    await admin.firestore().collection("notifications").add(notificationDoc);

    return res
      .status(200)
      .json(
        createResponse(
          true,
          "Resources transferred successfully",
          senderUserData
        )
      );
  } catch (error) {
    console.error("Error transferring resources:", error);
    return res.status(500).json(createResponse(false, "Internal server error"));
  }
});

router.get("/pending-requests", checkAuth, async (req, res) => {
  const { leagueID } = req.query;

  if (!leagueID) {
    return res.status(400).json(createResponse(false, "Missing leagueID"));
  }

  try {
    const pendingRequestsSnapshot = await admin
      .firestore()
      .collection("coinsRequests")
      .where("isAccepted", "==", false)
      .where("leagueID", "==", leagueID)
      .get();

    if (pendingRequestsSnapshot.empty) {
      return res
        .status(404)
        .json(createResponse(false, "No pending requests found"));
    }

    const pendingRequests = pendingRequestsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Fetch user profiles
    const userIds = pendingRequests.map((request) => request.userID);
    const userProfilesSnapshot = await admin
      .firestore()
      .collection("userProfiles")
      .where(admin.firestore.FieldPath.documentId(), "in", userIds)
      .get();

    const userProfiles = userProfilesSnapshot.docs.reduce((acc, doc) => {
      acc[doc.id] = doc.data().userName || "Anonymous";
      return acc;
    }, {});

    // Format response
    const formattedRequests = pendingRequests.map((request) => ({
      id: request.id,
      name: userProfiles[request.userID] || "Anonymous",
      coinsRequested: request.coinsRequested,
    }));

    return res
      .status(200)
      .json(
        createResponse(
          true,
          "Pending requests retrieved successfully",
          formattedRequests
        )
      );
  } catch (error) {
    console.error("Error retrieving pending requests:", error);
    return res.status(500).json(createResponse(false, "Internal server error"));
  }
});

module.exports = router;
