const async = require('async');

const queue = async.queue((task, callback) => {
    task.fn().then(callback).catch(callback);
}, 45);  // 45 requests per second

module.exports = queue;
