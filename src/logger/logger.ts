import * as winston from "winston";

export const LOGGER = winston.createLogger({
    level: 'info',
    transports: [
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});