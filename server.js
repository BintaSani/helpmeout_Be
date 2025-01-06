const express = require('express');
const axios = require('axios');
const cors = require('cors'); 
const multer = require('multer');
const crypto = require('crypto');
const admin = require('firebase-admin');
const cloudinary = require('cloudinary').v2;

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS)
  ),
});



const app = express();
app.use(cors({ origin: true })); // Enable CORS for all routes
app.use(express.json()); // To parse JSON request bodies
const upload = multer({ storage: multer.memoryStorage() });


// Root route for testing
app.get('/', (req, res) => {
  res.send('Backend is running and ready for transcription!');
});

// Generate Firebase Custom Token
app.post('/generate-token', async (req, res) => {
  const { storedUid } = req.body;
  if (!storedUid) return res.status(400).json({ error: 'UID is required' });

  try {
    const customToken = await admin.auth().createCustomToken(storedUid);
    res.json({ token: customToken });
  } catch (error) {
    console.error('Error generating custom token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});



app.post('/transcribe', async (req, res) => {
  const { playBack } = req.body; // Receive video URL from frontend

  try {
    const response = await axios.post(
      'https://api.rev.ai/speechtotext/v1/jobs',
      {
        source_config: { url: playBack },
        metadata: 'Transcription job',
      },
      {
        headers: {
          Authorization: 'Bearer 02LTprR4LVUJBoev2NYTDRs4c1sOQXF3HLsYvTBiYsVnnTAiutNgfmy7VpJyRzjoOgMKcBGu7kHl3U97ceK4c2B4AEiek', // Replace with your API key
          'Content-Type': 'application/json',
        },
      }
    );

    res.json(response.data); // Send Rev.ai's response back to the frontend
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const cloudName= process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET; 
const apiKey= process.env.CLOUDINARY_API_KEY;


app.get("/api/videos", async (req, res) => {
  const { folderPath } = req.query;  // Get folderPath from the query parameters

  if (!folderPath) {
    return res.status(400).json({ message: "folderPath is required" });
  }

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/video/upload`;

  try {
    const response = await axios.get(url, {
      params: { prefix: folderPath },
      auth: {
        username: apiKey,
        password: cloudinaryApiSecret,
      },
    });

    // Extract the required video data
    const videoData = response.data.resources.map((video) => ({
      public_id: video.public_id,
      url: video.secure_url,
      format: video.format,
      date_created: video.created_at,
    }));

    res.status(200).json(videoData);
  } catch (error) {
    console.error("Error fetching Cloudinary videos:", error.response?.data || error.message);
    res.status(500).send("Error fetching Cloudinary videos");
  }
});



app.post('/generate-signature', (req, res) => {
  const { timestamp, uid } = req.body;

  // Validate inputs
  if (!timestamp || !uid) {
    return res.status(400).json({ error: 'Missing timestamp or UID' });
  }

  // Use the UID to define the folder
  const folder = `uploads/${uid}`;
  const stringToSign = `folder=${folder}&timestamp=${timestamp}${cloudinaryApiSecret}`;
  const signature = crypto.createHash('sha256').update(stringToSign).digest('hex');

  res.json({ signature, folder });
});


// Endpoint to rename video
app.put("/api/videos/rename", async (req, res) => {
  const { public_id, new_name } = req.body;

  if (!public_id || !new_name) {
    return res.status(400).json({ message: "public_id and new_name are required" });
  }

  try {
    // Extract the folder path and current file name
    const pathBeforeFile = public_id.substring(0, public_id.lastIndexOf('/'));

    // Rename the file (but keep the path intact)
    const renamedVideo = await cloudinary.uploader.rename(public_id, `${pathBeforeFile}/${new_name}`, {
      resource_type: "video",
    });

    res.status(200).json({ message: "Video renamed successfully", renamedVideo });
  } catch (error) {
    console.error("Error renaming Cloudinary video:", error);
    res.status(500).send("Error renaming video");
  }
});


app.get("/transcript/:jobId", async (req, res) => {
  const { jobId, language } = req.params;
  try {
    // Make request to Rev.ai API for transcript in plain text format
    const response = await axios.get(`https://api.rev.ai/speechtotext/v1/jobs/${jobId}/transcript`, {
      headers: {
        Authorization: `Bearer 02LTprR4LVUJBoev2NYTDRs4c1sOQXF3HLsYvTBiYsVnnTAiutNgfmy7VpJyRzjoOgMKcBGu7kHl3U97ceK4c2B4AEiek`,
        Accept: "text/plain",  // Request plain text format
        language: language,
      },
    });
    
    // Return plain text response directly to the client
    res.type("text/plain");  // Set response type to plain text
    res.send(response.data);  // Send the plain text data from Rev.ai
  } catch (error) {
    res.status(error.response?.status || 500).send(error.message);
  }
});

module.exports = app;

