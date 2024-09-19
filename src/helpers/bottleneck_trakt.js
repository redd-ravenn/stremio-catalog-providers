const Bottleneck = require('bottleneck');

const traktLimiterGET = new Bottleneck({
    reservoir: 1000,
    reservoirRefreshAmount: 1000,
    reservoirRefreshInterval: 300 * 1000,
    maxConcurrent: 10
});

const traktLimiterPOST = new Bottleneck({
    minTime: 1000,
    maxConcurrent: 1
});

const addToQueueGET = (task) => {
    return traktLimiterGET.schedule(task.fn);
};

const addToQueuePOST = (task) => {
    return traktLimiterPOST.schedule(task.fn);
};

module.exports = { addToQueueGET, addToQueuePOST };
