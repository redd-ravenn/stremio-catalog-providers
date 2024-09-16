const Bottleneck = require('bottleneck');

const limiter = new Bottleneck({
    reservoir: 50,
    reservoirRefreshAmount: 50,
    reservoirRefreshInterval: 1000,
    maxConcurrent: 20
});

const addToQueue = (task) => {
    return limiter.schedule(task.fn);
};

module.exports = addToQueue;
