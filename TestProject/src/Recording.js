/* eslint-disable prettier/prettier */
import {
    Accelerometer,
    SensorType,
    GenericTimeframe,
    Mic,
    Gyroscope,
    Magnetometer,
    Barometer,
    SensorClass, getSensorClass, getSensorFileName,
} from "./Sensors";
import Label from './sensors/Label';
import {PermissionsAndroid, Platform} from 'react-native';
import {PERMISSIONS, check, request, RESULTS} from 'react-native-permissions';
import {
    mkdir,
    writeFile,
    appendFile,
    DocumentDirectoryPath,
    readDir,
    readFile,
    exists,
    unlink,
} from "react-native-fs";
import App from '../App';

export default class Recording {
    constructor() {
        this.name = 'Recording1';
        // this.folderPath = App.SAVE_FILE_PATH + this.name.replace(/ /g, '_') + '/';
        this.folderPath = App.SAVE_FILE_PATH;
        this.sampleRate = 40000; // in Hz
        this.bufferSize = 5; // The number of samples to store in the buffer before saving all of them to file at once
        this.timeframeSize = 10; // The number of samples in a timeframe. Additional points will be saved to file.
        this.enabledSensors = {};
        this.graphableData = {};
        this.logicalTime = 0;
        this.labels = [];

        // Create a folder for the current instance
        // TODO: Don't go to any other screen until this has been done
        mkdir(this.folderPath)
            .then(suc => { console.log('Successfully created ' + this.folderPath); })
            .catch(err => {
                throw new Error(this.constructor.name + '.constructor: Failed to create the recording directory');
            });

        // Delete the existing metadata file and create a new one
        const infoFilePath = this.folderPath + 'info.txt';
        exists(infoFilePath)
            .then(fileExists => {
                if (fileExists)
                {
                    unlink(infoFilePath).catch(() => {});
                }
            })
            .catch(() => {})
            .finally(() => {
                // Create the metadata file
                writeFile(infoFilePath, 'Recording name: ' + this.name, 'utf8')
                    .then(() => {
                        console.log('Successfully created ' + infoFilePath);
                    })
                    .catch(() => {
                        throw new Error(this.constructor.name + '.initialiseGenericSensor: Failed to create metadata file');
                    });
            });
    }

    /**
     * Initialise a new sensor and a generic timeframe
     * @param type The type of the sensor to initialise
     */
    initialiseGenericSensor(type)
    {
        const sensorClass = getSensorClass(type);
        const sensorFile = this.folderPath + getSensorFileName(type);
        // Create the timeframe array for the sensor (with an initial timeframe)
        this.graphableData[type] = [new GenericTimeframe(this, this.timeframeSize, this.bufferSize, type)];
        // Create a new sensor instance to track and enable it
        this.enabledSensors[type] = new sensorClass(this.graphableData[type], this.sampleRate);

        // Delete any existing file
        exists(sensorFile)
            .then(fileExists => {
                if (fileExists)
                {
                    unlink(sensorFile).catch(() => {});
                }
            })
            .catch(() => {})
            .finally(() => {
                // Create a file to store the data
                writeFile(sensorFile, '', 'utf8')
                    .then(() => {
                        console.log('Successfully created ' + this.folderPath + sensorClass.prototype.constructor.name + '.csv');
                    }) // TODO: Don't go to any other screen until this has been done
                    .catch(() => {
                        throw new Error(this.constructor.name + '.initialiseGenericSensor: Failed to create sensor file');
                    });
            });

        // TODO: Remove this
        // readFile(sensorFile, 'utf8')
        //     .then(content => {
        //         console.log(sensorFile + " - " + content);
        //     });
    }

    /**
     * Add a sensor to record data from
     *
     * @param type The type of sensor to add. For example, SensorType.ACCELEROMETER
     */
    addSensor(type) {
        switch (type)
        {
            case SensorType.ACCELEROMETER:
                this.initialiseGenericSensor(SensorType.ACCELEROMETER);
                break;
            case SensorType.GYROSCOPE:
                this.initialiseGenericSensor(SensorType.GYROSCOPE);
                break;
            case SensorType.MAGNETOMETER:
                this.initialiseGenericSensor(SensorType.MAGNETOMETER);
                break;
            case SensorType.BAROMETER:
                this.initialiseGenericSensor(SensorType.BAROMETER);
                break;
            case SensorType.MICROPHONE:
                // console.warn('Recording.addSensor(SensorType.MICROPHONE) has not been implemented');

                // request microphone permission
                const requestMicPermission = async () => {
                    if (Platform.OS === 'ios') {
                        const granted = await check(PERMISSIONS.IOS.MICROPHONE);
                        if (granted == RESULTS.GRANTED) {
                            console.log('iOS - You can use the microphone');
                        }
                    } else {
                        try {
                            const granted = await PermissionsAndroid.request(
                                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                                {
                                    title: 'Microphone Permission',
                                    message:
                                        'This app needs access to your microphone ' +
                                        'in order to collect microphone data',
                                    buttonNeutral: 'Ask Me Later',
                                    buttonNegative: 'Cancel',
                                    buttonPositive: 'OK',
                                }
                            );
                            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                                console.log('You can use the microphone');
                            } else {
                                console.log('Microphone permission denied');
                            }
                        } catch (err) {
                            console.warn(err);
                        }
                    }
                };

                requestMicPermission();
                this.initialiseGenericSensor(SensorType.MICROPHONE);

                break;
            default:
                throw new Error(this.constructor.name + '.addSensor: Received an unrecognised sensor type with id=' + type);
        }
    }

    /**
     * Set the label for all incoming data from hereon
     * @param name The name of the label
     */
    setLabel(name)
    {
        // Finalise the old label
        if (this.labels.length > 0 && this.labels[this.labels.length - 1].endTime == null)
        {
            this.labels[this.labels.length - 1].endTime = Date.now();
        }
        // Create the new label
        let label = new Label(name, Date.now());
        this.labels.push(label);
        // Create a new timeframe for each sensor
        for (const value of Object.values(this.graphableData))
        {
            value.push(new GenericTimeframe(this.timeframeSize, this.bufferSize, label));
        }
        // TODO: Asynchronously save all data from the previous timeframe to file
    }

    /**
     * Returns a reference to the latest timeframe of that sensor
     * @param type The type of sensor they would like to get the timeframe for
     * @return The latest timeframe for the specified sensor
     */
    getSensorData(type) {
        // Throw an error if the sensor hasn't been initialised
        if (this.graphableData[type] == null)
        {
            throw new Error('Recording.getSensorData: Attempted to get sensor data for type-' + type +
                ' but it has not been initialised correctly if at all.');
        }

        let sensorData = this.graphableData[type];
        return sensorData[sensorData.length - 1];
    }
}
