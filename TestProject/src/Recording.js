/* eslint-disable prettier/prettier */
import {
    GenericTimeframe,
    toSensorType,
    getSensorClass,
    getSensorFileName,
    SensorType,
    MicrophoneRecorder,
    BackCameraRecorder, SensorInfo, getSensorSampleClass
} from "./Sensors";
import Label from './sensors/Label';
import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {check, PERMISSIONS, RESULTS} from 'react-native-permissions';
import Share from 'react-native-share';
import RecordingManager from "./RecordingManager";
import Geolocation from 'react-native-geolocation-service';

const { ofstream } = NativeModules;

export default class Recording {
    constructor(name, folderPath, enabledSensors, enabledRecorders, id) {
        this.savedRecording = true // Determines whether the recording has been loaded from file
        this.id = id == undefined ? RecordingManager.generateRecordingId() : id;
        this.name = name; // TODO: Throw an error if a # or any non-alphanumeric characters are thrown
        this.folderPath = folderPath === undefined ? RecordingManager.SAVE_FILE_PATH + 'Recording_' + this.id + '/' : folderPath;
        this.sampleRate = 200; // in Hz
        this.bufferSize = 5; // The number of samples to store in the buffer before saving all of them to file at once
        this.timeframeSize = 10; // The number of samples in a timeframe. Additional points will be saved to file.
        this.enabledSensors = enabledRecorders === undefined ? {} : enabledRecorders;
        this.enabledRecorders = enabledSensors === undefined ? {} : enabledSensors;
        this.graphableData = {};
        this.fileStreamIndices = {};
        this.startTime = null;
        this.labels = [];

        // TODO: Make this platform independent!
        if (folderPath === undefined) {
            this.savedRecording = false;
            // Create the folder if it doesn't already exist
            ofstream.mkdir(this.folderPath)
                .then(() => {
                    console.log('Successfully created folder ' + this.folderPath);
                })
                .catch(err => {
                    throw Error(err);
                });

            // Create the file stream for the labels
            const createLabelsFile = async () => {
                this.fileStreamIndices[-1] = await ofstream.open(this.folderPath + "labels.csv", false);
                await ofstream.write(this.fileStreamIndices[-1], 'label,start_time,end_time\n');
            }
            createLabelsFile();
        }
    }

    async createMetadataFile() {
        if (this.folderPath === undefined) {
            throw new Error("Recording.createMetadataFile: Attempted to create a metadata file with an undefined folder path");
        }

        // TODO: Make this platform independent!
        //if (Platform.OS !== 'ios') {
            // TODO: Write this in a cleaner format
            console.log("Using " + this.id);
            // Create the metadata
            let metadata = '{"id": ' + this.id + ', "name":"' + this.name + '", "startTime":' + this.startTime + ',"sensors":[';
            let hasSensors = false
            let hasRecorders = false;
            for (const type of Object.keys(this.enabledSensors)) {
                hasSensors = true
                metadata += '{"id":' + type + ',"name":"' + SensorInfo[type].name + '"},'
            }
            metadata = (hasSensors ? metadata.slice(0, -1) : metadata) + '],"recorders":[';
            for (const type of Object.keys(this.enabledRecorders)) {
                hasRecorders = true
                metadata += '{"id":' + type + ',"name":"' + SensorInfo[type].name + '"},'
            }
            metadata = (hasRecorders ? metadata.slice(0, -1) : metadata) + ']}\n';

            // Write the metadata to file
            const infoFilePath = this.folderPath + 'info.json';
            ofstream.writeOnce(infoFilePath, false, metadata)
                .then(() => {
                    console.log('Successfully created ' + infoFilePath);
                })
                .catch(err => {
                    throw new Error(this.constructor.name + '.initialiseGenericSensor: ' + err);
                });
        //}
    }

    /**
     * Initialise a new sensor and a generic timeframe
     *
     * @param type       The type of the sensor to initialise
     * @param sampleRate The rate at which barometer data should be sampled
     */

    async initialiseGenericSensor(type, sampleRate) {
        const sensorClass = getSensorClass(type);
        const sensorSampleClass = getSensorSampleClass(type);
        const sensorFile = this.folderPath + getSensorFileName(type);
        // Create the timeframe array for the sensor (with an initial timeframe)
        this.graphableData[type] = [new GenericTimeframe(this, this.timeframeSize, this.bufferSize, type)];
        // Create a new sensor instance to track and enable it
        this.enabledSensors[type] = new sensorClass(this.graphableData[type], sampleRate);

        // Create a new file and store the stream index for later
        this.fileStreamIndices[type] = await ofstream.open(sensorFile, false);
        ofstream.write(this.fileStreamIndices[type], sensorSampleClass.getComponents().toString() + ',label\n');
    }

    /**
     * Add a sensor to record data from
     *
     * @param type       The type of sensor to add. For example, SensorType.ACCELEROMETER
     * @param sampleRate The rate at which barometer data should be sampled
     */
    async addSensor(type, sampleRate) {
        switch (Number(type))
        {
            case SensorType.ACCELEROMETER:
                await this.initialiseGenericSensor(SensorType.ACCELEROMETER, sampleRate);
                break;
            case SensorType.GYROSCOPE:
                await this.initialiseGenericSensor(SensorType.GYROSCOPE, sampleRate);
                break;
            case SensorType.MAGNETOMETER:
                await this.initialiseGenericSensor(SensorType.MAGNETOMETER, sampleRate);
                break;
            case SensorType.BAROMETER:
                await this.initialiseGenericSensor(SensorType.BAROMETER, sampleRate);
                break;
            case SensorType.GPS:
                await this.initialiseGenericSensor(SensorType.GPS, sampleRate);
                break;
            default:
                throw new Error(this.constructor.name + '.addSensor: Received an unrecognised sensor type with id=' + type);
        }
    }

    /**
     * Add a recorder
     *
     * @param type The type of recorder to add. For example, SensorType.BACK_CAMERA
     */
    addRecorder(type) {
        switch (Number(type)) {
            case SensorType.BACK_CAMERA:
                this.enabledRecorders[type] = new BackCameraRecorder(this);
                break;
            case SensorType.MICROPHONE:
                this.enabledRecorders[type] = new MicrophoneRecorder(this);
        }
    }

    /**
     * Set the label for all incoming data from hereon
     * @param name The name of the label
     * @param flushOnly True to only update the labels file
     */
    setLabel(name, flushOnly)
    {
        // Finalise the old label
        const lastLabel = this.labels[this.labels.length - 1];
        if (this.labels.length > 0 && lastLabel.endTime == null)
        {
            // TODO: Figure out why the initial null label isn't here -- may want to create a new label class at the start
            this.labels[this.labels.length - 1].endTime = Date.now();
            ofstream.write(this.fileStreamIndices[-1], lastLabel.name + ',' + lastLabel.startTime + ',' + lastLabel.endTime + '\n');
        }

        if (flushOnly) {
            return;
        }

        // Create the new label
        let label = new Label(name, Date.now());
        this.labels.push(label);
        // Create a new timeframe for each sensor
        for (const sensorTimeframe of Object.values(this.graphableData))
        {
            sensorTimeframe.push(new GenericTimeframe(this, this.timeframeSize, this.bufferSize, sensorTimeframe[0].type, label));
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

    /**
     *
     * @returns returns the path of a recording
     */
    getFolderPath() {
        return this.folderPath;
    }

    /**
     * Open the share menu to download the sensor file
     * @param type The type of sensor they would like to get the timeframe for
     */
    async shareSensorFile(type)
    {

        // File stream will not exist if a saved recording is loaded
        if (!this.savedRecording) {
            const streamIndex = this.fileStreamIndices[type]
            const fileOpened = streamIndex == null ? false : await ofstream.isOpen(this.fileStreamIndices[type]);
            // Make sure the writing stream has been closed before accessing the file
            if (fileOpened) {
                throw new Error("Recording.shareSensorFile: File cannot be shared as it is " +
                    "currently opened. File type: " + type);
            }
        }

        // Open the share menu to allow downloading the file
        const fileName = getSensorFileName(type);
        console.log(this.folderPath + fileName)

        const path = 'file://' + this.folderPath + fileName;
        Share.open({
            url: path,
            subject: fileName,
        });
    }

    /**
     * Enable all sensors and start all recorders
     */
    async start() {
        // Enable each sensor
        for (const sensorType of Object.keys(this.enabledSensors)) {
            this.enabledSensors[sensorType].enable();
        }

        // Enable each recorder
        // TODO: Check that the recorders started without errors
        for (const sensorType of Object.keys(this.enabledRecorders)) {
            this.enabledRecorders[sensorType].record();
        }
    }

    /**
     * Finalise the recording and save everything to file
     * @param clear True if all created files should be deleted (use if the recording has been cancelled)
     */
    async finish(clear = false)
    {
        // Flush out the last label
        this.setLabel(null, true);
        // Disable each sensor and its file stream
        for (const [sensorType, fileStreamIndex] of Object.entries(this.fileStreamIndices)) {
            // Disable all sensors
            if (sensorType > -1) {
                this.enabledSensors[sensorType].disable();
            }

            await ofstream.close(fileStreamIndex);

        }

        // Stop all recorders
        for (const sensorType of Object.keys(this.enabledRecorders)) {
            await this.enabledRecorders[sensorType].stop();
        }

        // Clear files
        if (clear) {
            try {
                del = ofstream.delete(this.folderPath, true);
            } catch (e) {
                throw new Error("Recording.finish: " + e);
            }
        }
        // Update listing
        else {
            RecordingManager.usedRecordingIds.add(this.id);
            try {
                await ofstream.writeOnce(RecordingManager.SAVE_FILE_PATH + "recordings.config", true, this.toString() + "\n");
            } catch (e) {
                throw new Error("Recording.finish: " + e);
            }
        }
    }

    toString() {
        return this.name + ";" + this.folderPath;
    }
}
