const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const port = 3000;

// Serve static files from 'src' directory
app.use(express.static('src'));

// API key and default settings
const apiKey = 'xEqumIcghTsJZR23DXvHOFIpNmPJBPWs'; // Replace with your Tomorrow.io API key
const defaultLocation = '42.3453,-71.0514';
const units = 'imperial';
const timesteps = '1d';

// Endpoint to get weather data
app.get('/api/weather', async (req, res) => {
    try {
        const location = req.query.location || defaultLocation;
        const forecastData = await getWeatherForecast(location);
        
        if (!forecastData || !forecastData.length) {
            throw new Error('Unable to fetch forecast data');
        }

        const relevantDates = forecastData.map(entry => entry.date);
        const startDate = relevantDates[0];
        const endDate = relevantDates[relevantDates.length - 1];
        
        const climateNormalsData = await getClimateNormals(location, startDate, endDate);
        
        if (!climateNormalsData || !climateNormalsData.length) {
            throw new Error('Unable to fetch climate normals data');
        }

        const anomalies = calculateAnomalies(forecastData, climateNormalsData);
        
        res.json({
            forecast: forecastData,
            climateNormals: climateNormalsData,
            anomalies: anomalies
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

async function getWeatherForecast(location) {
    const url = `https://api.tomorrow.io/v4/weather/forecast?location=${location}&units=${units}&timesteps=${timesteps}&apikey=${apiKey}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        // Check if response contains error
        if (data.code || data.error) {
            throw new Error(data.message || 'API Error: ' + JSON.stringify(data));
        }

        // Validate response structure
        if (!data.timelines || !data.timelines.daily || !Array.isArray(data.timelines.daily)) {
            throw new Error('Invalid API response structure for forecast data');
        }

        return data.timelines.daily.map(d => {
            if (!d.time || !d.values || typeof d.values.temperatureAvg === 'undefined') {
                throw new Error('Invalid data point in forecast response');
            }
            return {
                date: new Date(d.time).toISOString().slice(5, 10),
                temperature: d.values.temperatureAvg,
            };
        });
    } catch (error) {
        console.error('Error fetching forecast:', error);
        throw new Error(`Failed to fetch forecast data: ${error.message}`);
    }
}

async function getClimateNormals(location, startDate, endDate) {
    const url = `https://api.tomorrow.io/v4/historical/normals?apikey=${apiKey}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept-Encoding': 'gzip',
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                location,
                fields: ['temperatureAvg'],
                timesteps: [timesteps],
                startDate,
                endDate,
                units,
            }),
        });

        const data = await response.json();

        // Check if response contains error
        if (data.code || data.error) {
            throw new Error(data.message || 'API Error: ' + JSON.stringify(data));
        }

        // Validate response structure
        if (!data.data || !data.data.timelines || !data.data.timelines[0] || !data.data.timelines[0].intervals) {
            throw new Error('Invalid API response structure for climate normals');
        }

        return data.data.timelines[0].intervals.map(interval => {
            if (!interval.startDate || !interval.values || typeof interval.values.temperatureAvg === 'undefined') {
                throw new Error('Invalid data point in climate normals response');
            }
            return {
                date: interval.startDate,
                temperature: interval.values.temperatureAvg,
            };
        });
    } catch (error) {
        console.error('Error fetching climate normals:', error);
        throw new Error(`Failed to fetch climate normals: ${error.message}`);
    }
}

function calculateAnomalies(forecastData, climateNormalsData) {
    const anomalyThreshold = 10;
    return forecastData.map((entry, index) => {
        const forecastTemp = entry.temperature;
        const normalTemp = climateNormalsData[index].temperature;
        const percentAnomaly = ((forecastTemp - normalTemp) / normalTemp) * 100;
        return Math.abs(percentAnomaly) >= anomalyThreshold ? percentAnomaly : 0;
    });
}

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'api.html'));
});

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Make sure to replace 'YOUR_API_KEY' with your Tomorrow.io API key in app.js`);
});