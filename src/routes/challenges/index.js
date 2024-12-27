const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

const challenges = [
  {
    buildingID: "3",
    description: "HouseAs",
    requiredCount: 4,
  },
  {
    buildingID: "4",
    description: "HouseBs",
    requiredCount: 4,
  },
  {
    buildingID: "7",
    description: "Factory",
    requiredCount: 1,
  },
  {
    buildingID: "6",
    description: "School",
    requiredCount: 1,
  },
  {
    buildingID: "11",
    description: "Hospital",
    requiredCount: 1,
  },
  {
    buildingID: "5",
    description: "SkyScrapper",
    requiredCount: 1,
  },
  {
    buildingID: "10",
    description: "WindTurbines",
    requiredCount: 2,
  },
];

const createChallenge = async () => {
  // Select a random challenge
  const randomChallenge =
    challenges[Math.floor(Math.random() * challenges.length)];
  const randomCount = Math.floor(Math.random() * 9) + 1;
  // Define the startTime and endTime
  const startTime = new Date().toISOString();
  const endTime = new Date(new Date().getTime() + 15 * 60 * 1000).toISOString(); // 15 minutes after startTime

  // Construct the new challenge object
  const newChallenge = {
    startTime,
    endTime,
    leagueID: null, // Will handle per league below
    message: `Build ${randomCount} ${randomChallenge.description}`,
    required: {
      buildingID: randomChallenge.buildingID,
      count: randomCount,
    },
    points: 200, // Example reward points
    isEnded: false,
  };

  try {
    // Validate the building ID
    const buildingRef = admin
      .firestore()
      .collection("buildings")
      .doc(newChallenge.required.buildingID);
    const buildingDoc = await buildingRef.get();
    if (!buildingDoc.exists) {
      throw new Error(
        `No building found for the id: ${newChallenge.required.buildingID}`
      );
    }

    // Add the challenge to Firestore
    const challengeRef = await admin
      .firestore()
      .collection("challenges")
      .add(newChallenge);

    // Fetch all user IDs
    const userProfilesSnapshot = await admin
      .firestore()
      .collection("userProfiles")
      .get();
    const userIds = userProfilesSnapshot.docs.map((doc) => doc.id);

    // Fetch all league IDs
    const leaguesSnapshot = await admin.firestore().collection("leagues").get();
    const leagueIds = leaguesSnapshot.docs.map((doc) => doc.id);

    // Create challengeProgress documents
    const batch = admin.firestore().batch();

    // For each user without league
    userIds.forEach((userID) => {
      const challengeProgress = {
        challengeID: challengeRef.id,
        userID,
        leagueID: null,
        progress: {
          buildingID: newChallenge.required.buildingID,
          count: 0,
        },
        isCompleted: false,
      };
      const challengeProgressRef = admin
        .firestore()
        .collection("challengeProgress")
        .doc();
      batch.set(challengeProgressRef, challengeProgress);
    });

    // For each league and user
    leagueIds.forEach((leagueID) => {
      userIds.forEach((userID) => {
        const challengeProgress = {
          challengeID: challengeRef.id,
          userID,
          leagueID,
          progress: {
            buildingID: newChallenge.required.buildingID,
            count: 0,
          },
          isCompleted: false,
        };
        const challengeProgressRef = admin
          .firestore()
          .collection("challengeProgress")
          .doc();
        batch.set(challengeProgressRef, challengeProgress);
      });
    });

    // Commit batch writes
    await batch.commit();

    // Create the notification document
    const notificationDoc = {
      message:
        "New eco challenge! Complete the challenge to get 200 coins reward",
      notificationType: "challenge",
      isGlobal: true,
      userID: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await admin.firestore().collection("notifications").add(notificationDoc);

    return { id: challengeRef.id };
  } catch (error) {
    throw new Error(`Error creating challenge: ${error.message}`);
  }
};

router.post("/create-challenge", checkAuth, async (req, res) => {
  try {
    const result = await createChallenge();
    res.json(createResponse(true, "Challenge created successfully", result));
  } catch (error) {
    console.error(error.message);
    res.status(500).json(createResponse(false, error.message));
  }
});

// router.post("/test-building-creation", checkAuth, async (req, res) => {
//   const { buildingID, userID, leagueID } = req.body;

//   if (!buildingID || !userID) {
//     return res
//       .status(400)
//       .json(createResponse(false, "buildingID and userID are required"));
//   }

//   try {
//     await handleBuildingCreation(buildingID, userID, leagueID);
//     res.json(createResponse(true, "Building creation handled successfully"));
//   } catch (error) {
//     console.error("Error handling building creation:", error);
//     res
//       .status(500)
//       .json(createResponse(false, "An error occurred", error.message));
//   }
// });

router.post("/create-challenge-progress", checkAuth, async (req, res) => {
  const { challengeID, userID, buildingID, count, leagueID } = req.body;

  if (!challengeID || !userID || !buildingID || !count) {
    return res
      .status(400)
      .json(createResponse(false, "All fields are required"));
  }

  const challengeProgress = {
    challengeID,
    userID,
    leagueID: leagueID || null,
    progress: {
      buildingID,
      count,
    },
    isCompleted: false,
  };

  try {
    const challengeRef = admin
      .firestore()
      .collection("challenges")
      .doc(challengeID);
    const challengeDoc = await challengeRef.get();
    if (!challengeDoc.exists) {
      return res
        .status(404)
        .json(
          createResponse(false, `No challenge found for the id: ${challengeID}`)
        );
    }

    if (leagueID) {
      const leagueRef = admin.firestore().collection("leagues").doc(leagueID);
      const leagueDoc = await leagueRef.get();
      if (!leagueDoc.exists) {
        return res
          .status(404)
          .json(
            createResponse(false, `No league found for the id: ${leagueID}`)
          );
      }
    }

    await admin
      .firestore()
      .collection("challengeProgress")
      .add(challengeProgress);
    res.json(createResponse(true, "Challenge progress created successfully"));
  } catch (error) {
    console.error("Error creating challenge progress:", error);
    res
      .status(500)
      .json(createResponse(false, "An error occurred", error.message));
  }
});

router.get("/active-challenges", checkAuth, async (req, res) => {
  try {
    const now = new Date();
    const activeChallengesSnapshot = await admin
      .firestore()
      .collection("challenges")
      .where("isEnded", "==", false)
      .get();

    const activeChallenges = activeChallengesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(
      createResponse(
        true,
        "Active challenges fetched successfully",
        activeChallenges
      )
    );
  } catch (error) {
    console.error("Error fetching active challenges:", error);
    res
      .status(500)
      .json(createResponse(false, "An error occurred", error.message));
  }
});

router.get("/completed-challenges", checkAuth, async (req, res) => {
  const userID = req.user.user_id;
  const { leagueID } = req.query;

  try {
    let query = admin
      .firestore()
      .collection("challengeProgress")
      .where("userID", "==", userID)
      .where("isCompleted", "==", true);

    if (leagueID) {
      query = query.where("leagueID", "==", leagueID);
    } else {
      query = query.where("leagueID", "==", null);
    }

    const completedChallengesSnapshot = await query.get();
    const completedChallenges = await Promise.all(
      completedChallengesSnapshot.docs.map(async (doc) => {
        const data = doc.data();

        // Get building details
        const buildingDoc = await admin
          .firestore()
          .collection("buildings")
          .doc(data.progress.buildingID)
          .get();
        const building = buildingDoc.data();

        // Get challenge details
        const challengeDoc = await admin
          .firestore()
          .collection("challenges")
          .doc(data.challengeID)
          .get();
        const challenge = challengeDoc.data();

        // Calculate time difference
        const endTime =
          challenge.endTime instanceof admin.firestore.Timestamp
            ? challenge.endTime.toDate()
            : new Date(challenge.endTime);
        const now = new Date();
        const timeDiff = Math.abs(now - endTime);
        const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutesDiff = Math.floor(
          (timeDiff % (1000 * 60 * 60)) / (1000 * 60)
        );
        const endTimeMessage =
          hoursDiff > 0
            ? `Ended ${hoursDiff} hours ago`
            : `Ended ${minutesDiff} minutes ago`;

        // Format message
        const title = building.title;
        const count = challenge.required.count;
        const message = `Build ${count} ${title}`;

        return {
          id: doc.id,
          progress: data.progress,
          isCompleted: data.isCompleted,
          message,
          requiredCount: count,
          endTime: endTimeMessage,
          points: challenge.points,
        };
      })
    );

    res.json(
      createResponse(
        true,
        "Completed challenges fetched successfully",
        completedChallenges
      )
    );
  } catch (error) {
    console.error("Error fetching completed challenges:", error);
    res
      .status(500)
      .json(createResponse(false, "An error occurred", error.message));
  }
});

router.get("/challenge-progress", checkAuth, async (req, res) => {
  const userID = req.user.user_id;
  const { leagueID } = req.query;

  try {
    let query = admin
      .firestore()
      .collection("challengeProgress")
      .where("userID", "==", userID);

    if (leagueID) {
      query = query.where("leagueID", "==", leagueID);
    } else {
      query = query.where("leagueID", "==", null);
    }

    const challengeProgressSnapshot = await query.get();
    const challengeProgress = await Promise.all(
      challengeProgressSnapshot.docs.map(async (doc) => {
        const data = doc.data();

        // Get building details
        const buildingDoc = await admin
          .firestore()
          .collection("buildings")
          .doc(data.progress.buildingID)
          .get();
        const building = buildingDoc.data();

        // Get challenge details
        const challengeDoc = await admin
          .firestore()
          .collection("challenges")
          .doc(data.challengeID)
          .get();
        const challenge = challengeDoc.data();

        // Format message
        const title = building.title;
        const count = challenge.required.count;
        const message = `Build ${count} ${title}`;

        return {
          id: doc.id,
          progress: data.progress,
          isCompleted: data.isCompleted,
          message,
          requiredCount: count,
          endTime: challenge.endTime,
          points: challenge.points,
        };
      })
    );

    res.json(
      createResponse(
        true,
        "Challenge progress fetched successfully",
        challengeProgress
      )
    );
  } catch (error) {
    console.error("Error fetching challenge progress:", error);
    res
      .status(500)
      .json(createResponse(false, "An error occurred", error.message));
  }
});

module.exports = router;
