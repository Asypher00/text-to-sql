require('dotenv').config();
const listAvailableModels = async () => {
  const axios = require('axios');
  
  // First, get an access token using your API key
  try {
    // Log the endpoint to verify it's correctly loaded
    console.log("Using endpoint:", process.env.WATSONX_AI_ENDPOINT);
    
    if (!process.env.WATSONX_AI_ENDPOINT) {
      throw new Error("WATSONX_AI_ENDPOINT is not defined in environment variables");
    }
    
    // Make sure the endpoint is properly formatted
    const endpoint = process.env.WATSONX_AI_ENDPOINT.trim();
    
    // Get the models endpoint
    const modelsUrl = `${endpoint}/models`;
    console.log("Requesting models from:", modelsUrl);
    
    const response = await axios.get(modelsUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.WATSONX_AI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log("Available models:", response.data);
  } catch (error) {
    console.error("Error fetching models:", 
      error.response?.data || error.message || error);
    
    // Additional debugging
    console.log("Environment variables check:");
    console.log("- ENDPOINT set:", Boolean(process.env.WATSONX_AI_ENDPOINT));
    console.log("- PROJECT_ID set:", Boolean(process.env.WATSONX_AI_PROJECT_ID));
    console.log("- API_KEY set:", Boolean(process.env.WATSONX_AI_API_KEY));
  }
};

listAvailableModels();