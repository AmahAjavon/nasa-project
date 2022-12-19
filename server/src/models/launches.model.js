const axios = require('axios');

const launchesDatabase = require('./launches.mongo');
const planets = require('./planets.mongo');

const DEFAULT_FLIGHT_NUMBER = 100;

// const launch = {
//     flightNumber: 100, //flight_number
//     mission: 'Kepler Exploration X', //name
//     rocket: 'Explorer IS1', //rocket.name
//     launchDate: new Date('December 27, 2030'), //date_local
//     target: 'Kepler-442 b', // not applicable
//     customers: ['Francium', 'NASA'], //payload.customers for each payload
//     upcoming: true, //upcoming
//     success: true, //success
// }

// saveLaunch(launch);

const SPACEX_API_URL = process.env.SPACEX_API_URL;

async function populateLaunches() {
    console.log('Downloading launches data');
    const response = await axios.post(SPACEX_API_URL, {
        query:{},
        options: {
            pagination: false,
            populate: [
                {
                    path: 'rocket',
                    select: {
                        name: 1
                    }
                },
                {
                    path: 'payloads',
                    select: {
                        'customers': 1
                    }
                }
            ]
        }

    });

    if (response.status !== 200) {
        console.log('Problem downloading launch data');
        throw new Error('Launch data download failed');
    }

    const launchDocs = response.data.docs;
    for (let doc of launchDocs) {
        const payloads = doc['payloads'];
        const customers = payloads.flatMap((payload) => {
            return payload['customers'];
        })

        const launch = {
            flightNumber: doc['flight_number'],
            mission: doc['name'],
            rocket: doc['rocket']['name'],
            launchDate: doc['date_local'],
            upcoming: doc['upcoming'],
            success: doc['success'],
            customers,
        }
        console.log(`${launch.flightNumber} **** ${launch.mission} *** ${launch.rocket}`)

        await saveLaunch(launch)
    }
}

async function loadLaunchesData() {

    const firstLaunch = await findLaunch({
        flightNumber: 1,
        rocket: 'Falcon 1',
        mission: 'FalconSat',
    });
    if (firstLaunch) {
        console.log('Launch data already loaded')
        return;
    } else {
        await populateLaunches();
    }

}

async function findLaunch(filter) {
    return await launchesDatabase.findOne(filter);
}

async function existsLaunchWithId(launchId) {
    return await findLaunch(launchId)
}

async function getLatestFlightNumber() {
    const latestLaunch = await launchesDatabase
        .findOne({})
        .sort('-flightNumber');
    if (!latestLaunch) {
        return DEFAULT_FLIGHT_NUMBER;
    }

    return latestLaunch.flightNumber;
}

async function getAllLaunches(skip, limit) {
    return await launchesDatabase.find({}, {'_id': 0, '__v': 0})
        .sort({ flightNumber: 1 })
        .skip(skip)
        .limit(limit);
}

async function saveLaunch(launch) {

    await launchesDatabase.findOneAndUpdate({
        flightNumber: launch.flightNumber,
    }, launch, {
        upsert: true,
    })
}

async function scheduleNewLaunch(launch) {
    const planet = await planets.findOne({
        keplerName: launch.target,
    });

    if (!planet) {
        throw new Error('No matching planet found');
    }
    const newFlightNumber = await getLatestFlightNumber() +1;

    const newLaunch = Object.assign(launch, {
        success: true,
        upcoming: true,
        customers: ['Francium', 'NASA'],
        flightNumber: newFlightNumber,
    });
    await saveLaunch(newLaunch);
}

async function abortLaunchById(launchId) {
    const aborted = await launchesDatabase.updateOne({
        flightNumber: launchId,
    }, {
        upcoming: false,
        success: false,
    });

    return aborted.modifiedCount === 1;
}

module.exports = {
    getAllLaunches,
    scheduleNewLaunch,
    existsLaunchWithId,
    abortLaunchById,
    loadLaunchesData,
}