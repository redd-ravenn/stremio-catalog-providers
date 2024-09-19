const Bottleneck = require('bottleneck');

const tmdbLimiter = new Bottleneck({
    reservoir: 50,
    reservoirRefreshAmount: 50,
    reservoirRefreshInterval: 1000,
    maxConcurrent: 20
});

const addToQueueTMDB = (task) => {
    return tmdbLimiter.schedule(task.fn);
};

module.exports = addToQueueTMDB;
