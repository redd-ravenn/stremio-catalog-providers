const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

winston.addColors({
    error: 'red',
    warn: 'yellow',
    info: 'blue',
    debug: 'green'
});

const uppercaseLevelFormat = winston.format((info) => {
    info.level = info.level.toUpperCase();
    return info;
})();

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILE_PATH = path.join(__dirname, '../../log/application-%DATE%.log');
const MAX_FILES = process.env.LOG_INTERVAL_DELETION || '3d'; 

const log = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
        uppercaseLevelFormat,
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp }) => {
            return `[${timestamp}] [${level}]: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ level, message, timestamp }) => {
                    return `[${timestamp}] [${level}]: ${message}`;
                })
            )
        }),
        new DailyRotateFile({
            filename: LOG_FILE_PATH,
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: MAX_FILES
        })
    ]
});

log.exceptions.handle(
    new DailyRotateFile({
        filename: path.join(__dirname, '../../log/exceptions-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d'
    })
);

process.on('unhandledRejection', (reason, promise) => {
    log.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

log.on('error', function (err) {
    console.error('Erreur dans le logger:', err);
});

module.exports = log;
