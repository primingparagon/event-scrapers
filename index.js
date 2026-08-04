const axios = require('axios');
const { scrapeLocalist } = require('./scrapers/localist');
const { scrapeTribe } = require('./scrapers/tribe');

async function notifyRender() {
  console.log('Sending sync command to Render back-end...');
  const renderUrl = process.env.RENDER_BACKEND_URL;
  const syncSecret = process.env.SCRAPER_API_KEY;

  if (!renderUrl || !syncSecret) {
    console.error('Error: RENDER_BACKEND_URL or SCRAPER_API_KEY environment variables are missing.');
    return;
  }

  try {
    const response = await axios.post(
      renderUrl, 
      { status: "success", message: "Google Sheets have been updated with new events." }, 
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Scraper-Key': syncSecret
        },
        timeout: 10000
      }
    );
    console.log(`Render Response Status: ${response.status}`);
  } catch (error) {
    console.error('Failed to notify Render:', error.response ? error.response.data : error.message);
  }
}

async function runPipeline() {
  console.log('--- Starting Event Scraping Pipeline ---');
  
  try {
    await scrapeLocalist();
  } catch (error) {
    console.error('Localist scraper error:', error.message);
  }

  try {
    await scrapeTribe();
  } catch (error) {
    console.error('Tribe scraper error:', error.message);
  }

  console.log('--- Sheets Updates Finished ---');
  await notifyRender();
}

runPipeline();
