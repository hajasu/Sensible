/* eslint-disable prettier/prettier */
import "react-native-gesture-handler";
import React, {Component, useState, useRef} from "react";
import {FloatingAction} from "react-native-floating-action";
//import DropDownPicker from "react-native-dropdown-picker";
import FAB from "../react-native-paper-src/components/FAB/FAB";
import PaperButton from "../react-native-paper-src/components/Button";
import Appbar from '../react-native-paper-src/components/Appbar'
import {getSensorClass, HardwareType, SensorInfo, SensorType} from "../Sensors";
import CheckBox from 'react-native-check-box'
import {KeyboardAwareFlatList, KeyboardAwareScrollView} from 'react-native-keyboard-aware-scroll-view'

//TODO reimplement the text inputs with this one to keep the app thematicaly consistant
//import TextInput from '../react-native-paper-src/components/TextInput/TextInput'

import {
    BackHandler,
    StyleSheet,
    View,
    Text,
    TextInput,
    Image,
    TouchableOpacity,
    TouchableWithoutFeedback,
    StatusBar,
    FlatList,
    KeyboardAvoidingView,
    Modal
} from "react-native";
import Icon from "react-native-vector-icons"
import RecordingManager from "../RecordingManager";

class NewRecordingScreen extends Component {
    constructor(props) {
        // TODO: Use sensor types
        super(props);
        this.state = {
            currentLabelAddition: "",
            addedLabels: [],
            sensorSampleRates: {},
            usedSensors: {},
            modalVisible: false,
            currentSensorInfo: null,
            startingRecording: false,
            errorVisible: false,
            currentError: "",
            recordingTitle: "Recording " + (RecordingManager.currentRecording.id),
            baseTitle: "Recording " + (RecordingManager.currentRecording.id),
            helpShown: false,
        };

        // Ensure the recording class has been initialised
        if (RecordingManager.currentRecording == null) {
            throw new Error("NewRecordingScreen.constructor: RecordingManager.currentRecording has not been initialised");
        }

        for (const sensorId of Object.values(SensorType)) {
            this.state.sensorSampleRates[sensorId] = Math.trunc((getSensorClass(sensorId).maxSampleRate - getSensorClass(sensorId).minSampleRate)/2);
        }
    }

    componentDidMount = () => {
        //make sure that the accelorometer is the default item in the picker view
        //this.sensorPicker.selectItem('accelerometer');
    };

    // TODO: Determine original creator
    /**
     * Created by ?, Modified by Chathura Galappaththi
     *
     * Add each sensor to the current recording and move to the next screen
     */
    async startRecording() {
        // Add each sensor which has been selected
        let selectedSensors = []
        for (const [sensorId, selected] of Object.entries(this.state.usedSensors)) {
            if (!selected) {
                continue;
            }

            // For sensors that aren't implemented
            if (sensorId == null) {
                continue;
            }

            selectedSensors.push(sensorId);
            if (SensorInfo[sensorId].type == HardwareType.SENSOR) {

                const selectedSampleRate = parseInt(this.state.sensorSampleRates[sensorId])

                //TODO update this part with the sample rate
                await RecordingManager.currentRecording.addSensor(sensorId, selectedSampleRate);
            }
            else if (SensorInfo[sensorId].type == HardwareType.RECORDER) {
                await RecordingManager.currentRecording.addRecorder(sensorId);
            }
        }

        if (this.state.recordingTitle.replace(/\s/g, "") !== "") {
            RecordingManager.currentRecording.name = this.state.recordingTitle;
        } else {
            RecordingManager.currentRecording.name = this.state.baseTitle;
        }
        if (this.state.currentLabelAddition !== "" && this.state.currentLabelAddition != this.state.addedLabels[this.state.addedLabels.length-1].labelName) {
            const newLabel = {labelName: this.state.currentLabelAddition};
            this.state.addedLabels.push(newLabel);
            this.setState({addedLabels: [...this.state.addedLabels]});
        }
        // Navigate to the next screen
        this.props.navigation.navigate("RecordingScreen", {
            "sensors": selectedSensors,
            "labels": this.state.addedLabels,
        });
    }


    sensorRow(sensorInfo, sensorId) {
        return (
            <View key={sensorId} style={[styles.sensorListItem, {justifyContent: 'space-between'}]}>

                <View style={{flexDirection: "row", alignItems: "center"}}>

                    <TouchableOpacity onPress={() => this.showInfo(sensorInfo)}>
                        <Image source={require('../assets/information_icon.png')} style={[styles.infoButton]}/>
                    </TouchableOpacity>

                    <Image source={sensorInfo.imageSrc} style={[styles.iconButon, {marginEnd: 'auto'}]}/>

                    <Text
                        style={{paddingLeft: 10}}>{sensorInfo.name}</Text>
                </View>

                <View style={{alignSelf: 'center', flexDirection: "row"}}>
                    {
                        SensorInfo[sensorId].type == HardwareType.SENSOR &&
                        <TextInput
                            scrollEnabled={false}
                            placeholder="sample rate"
                            style={{paddingRight: 10}}
                            ref={input => {
                                this.sampleRateInput = input;
                            }}
                            keyboardType="numeric"
                            value={this.state.sensorSampleRates[sensorId].toString()}
                            onChangeText={
                                text => {
                                    if (text === "") {
                                        this.state.sensorSampleRates[sensorId] = text
                                        this.state.usedSensors[sensorId] = false;
                                    }
                                    else {
                                        text = Number(text.replace(/[^0-9]/g, ''));
                                        const maxSampleRate = getSensorClass(sensorId).maxSampleRate
                                        const minSampleRate = getSensorClass(sensorId).minSampleRate
                                        if (text > maxSampleRate) {
                                            this.state.sensorSampleRates[sensorId] = maxSampleRate;
                                        }
                                        else if (text < minSampleRate) {
                                            this.state.sensorSampleRates[sensorId] = minSampleRate;
                                        }
                                        else {
                                            this.state.sensorSampleRates[sensorId] = text;
                                        }
                                        this.state.usedSensors[sensorId] = true;
                                    }
                                    this.setState({});
                                }
                            }
                        />
                    }
                    {
                        SensorInfo[sensorId].type == HardwareType.RECORDER &&
                        <Text style={styles.descriptionText}>Sample rate set</Text>
                    }

                    <CheckBox
                        style={{flexDirection: "row"}}
                        isChecked={this.state.usedSensors[sensorId]}
                        onClick={async () => {
                            // Make sure that a sample rate has been specified before allowing the check box to be selected
                            if (SensorInfo[sensorId].type == HardwareType.SENSOR && this.state.sensorSampleRates[sensorId] === "") {
                                this.state.sensorSampleRates[sensorId] = Math.trunc((getSensorClass(sensorId).maxSampleRate - getSensorClass(sensorId).minSampleRate)/2);
                            }
                            // Prevent the sensor from being added if it doesn't work
                            // TODO: Perform this check before getting to this screen
                            else if (!(await getSensorClass(sensorId).isSensorWorking())) {
                                this.setState({
                                    errorVisible: true,
                                    currentError: sensorInfo.name + " could not be set. Your phone may not have access to this sensor.",
                                })
                                // Box will be unchecked automatically
                                return;
                            }

                            //modifiy the state to record that a checkbox has been pressed
                            this.state.usedSensors[sensorId] = !this.state.usedSensors[sensorId]
                            this.setState(this.state.usedSensors)
                        }}
                    />
                </View>
            </View>
        )
    }

    labelListItem = ({item}) => (
        <View style={styles.labelListItem}>

            <Text>{item.labelName}</Text>

            <TouchableOpacity
                style={{marginLeft: "auto"}}
                onPress={() => {

                    //remove the selected label from the list
                    for (var i in this.state.addedLabels) {
                        if (item.labelName == this.state.addedLabels[i]["labelName"]) {
                            this.state.addedLabels.splice(i, 1);
                            break;
                        }
                    }

                    this.setState({addedLabels: [...this.state.addedLabels]});

                }}>

                <Image source={require("../assets/baseline_close_black.png")} style={styles.iconButon}/>
            </TouchableOpacity>
        </View>
    );

    //constant item that stays at the bottom of the list. This acts as the add new row in the list
    labelListFooter = () => {
        return (
            <View style={styles.labelListFooter}>

                <TextInput
                    scrollEnabled={false}

                    placeholder="Label Name"
                    styles={{fontSize: 40}}
                    ref={input => {
                        this.labelNameInput = input;
                    }}
                    onChangeText={
                        text => this.setState({currentLabelAddition: text})
                    }/>

                <TouchableOpacity
                    style={{marginLeft: "auto"}}
                    onPress={() => {

                        //return if a duplicate has been found
                        for (let i in this.state.addedLabels) {
                            if (this.state.addedLabels[i]["labelName"] === this.state.currentLabelAddition) {
                                return;
                            }
                        }

                        //make sure that a value has been entered into the lable name textinput before the button is allowed to be pressed
                        // and make sure that the label name is not in the addedLabels already
                        if (this.state.currentLabelAddition !== "") {

                            const newLabel = {labelName: this.state.currentLabelAddition};
                            this.state.addedLabels.push(newLabel);
                            this.setState({addedLabels: [...this.state.addedLabels]});

                            this.labelNameInput.clear();
                        }
                    }}>

                    <Image source={require("../assets/baseline_add_black.png")} style={styles.iconButon}/>
                </TouchableOpacity>
            </View>
        );
    };

    /**
     * Created by Ryan Turner, Modified by Chathura Galappaththi
     *
     * Presents modal to the user, with info on the sensor they just pressed
     * @param sensorInfo Sensor information to show in the modal
     */
    showInfo(sensorInfo) {
        this.setState({modalVisible: true, currentSensorInfo: sensorInfo})
    }

    render() {
        let sensorRows = Object.entries(SensorInfo).map(([sensorId, sensorInfo]) => {
            if (getSensorClass(sensorId).isSensorWorkingSync()) {
                return this.sensorRow(sensorInfo, sensorId);
            } else {
                return <Text key={sensorId} style={styles.sensorInactive}>{sensorInfo.name} not active - check settings</Text>;
            }
        })

        return (
            <View style={styles.container}>
                <StatusBar barStyle="dark-content"/>

                <Appbar.Header>
                    <TextInput style={styles.title} value={this.state.recordingTitle} onChangeText={text => {
                        if (text.length < 20) {
                            this.setState({recordingTitle: text.replace(/[^0-9a-z' ']/gi, '')})
                        }
                    }} />
                    <Appbar.Content/>
                    <Appbar.Action style={[styles.helpIcon]} size={35} icon={require("../assets/help_icon.png")}
                                                                            onPress={() => {this.setState({helpShown: true})}}/>
                    <Appbar.Action icon={require('../assets/baseline_close_black.png')}
                                   onPress={() => this.props.navigation.goBack()}/>
                </Appbar.Header>

                <View style={styles.content}>

                    <FlatList
                        styles={{flex: 1}}
                        removeClippedSubviews={false}
                        data={this.state.addedLabels}
                        renderItem={this.labelListItem}
                        keyboardShouldPersistTaps='handled'
                        keyExtractor={item => item.labelName}
                        ListHeaderComponent={
                                <View>
                                    {sensorRows}
                                    <View style={{paddingBottom: 10, fontSize: 20}}>
                                        <Text>{"Labels"}</Text>
                                    </View>
                                </View>
                            }
                        ListFooterComponent={this.labelListFooter}/>
                </View>

                <FAB
                    style={styles.fab}
                    loading={this.state.startingRecording}
                    disabled={this.state.startingRecording}
                    label="Start Recording"
                    onPress={() => {
                        // Prevent the recording from being started if no sensors have been selected
                        if (Object.entries(this.state.usedSensors).length === 0) {
                            this.setState({
                                errorVisible: true,
                                currentError: "No sensors selected! Please select a sensor."
                            })
                            return;
                        }
                        for (var i = 0; i < Object.entries(this.state.usedSensors).length; i++) {
                            if (!Object.entries(this.state.usedSensors)[i][1]) {
                                this.setState({
                                    errorVisible: true,
                                    currentError: "No sensors selected! Please select a sensor."
                                })
                                return;
                            }
                        }
                        this.startRecording();
                        this.setState({startingRecording: true})
                    }}
                />


                <Modal
                    animationType="fade"
                    transparent={true}
                    visible={this.state.modalVisible}>
                    <TouchableWithoutFeedback onPress={() => {
                        this.setState({modalVisible: false})
                    }}>
                        <View style={styles.modalOverlay}/>
                    </TouchableWithoutFeedback>

                    <View style={styles.parentView}>
                        <View style={styles.modalView}>
                            <Text>Sensor: {this.state.currentSensorInfo != null ? this.state.currentSensorInfo.name : ""}</Text>
                            <Text
                                style={styles.sensorDescriptions}>Measures: {this.state.currentSensorInfo != null ? this.state.currentSensorInfo.description.measure : ""}</Text>
                            <Text
                                style={styles.sensorDescriptions}>Output: {this.state.currentSensorInfo != null ? this.state.currentSensorInfo.description.output : ""}</Text>
                            <PaperButton
                                style={styles.closeModal}
                                mode="contained"
                                onPress={() => {
                                    this.setState({modalVisible: false})
                                }}
                            >Close</PaperButton>
                        </View>
                    </View>
                </Modal>
                <Modal
                    animationType="fade"
                    transparent={true}
                    visible={this.state.errorVisible}>
                    <TouchableWithoutFeedback onPress={() => {
                        this.setState({errorVisible: false})
                    }}>
                        <View style={styles.modalOverlay}/>
                    </TouchableWithoutFeedback>

                    <View style={styles.parentView}>
                        <View style={styles.errorView}>
                            <Text>Error: {this.state.currentError}</Text>
                            <PaperButton
                                style={styles.closeModal}
                                mode="contained"
                                onPress={() => {
                                    this.setState({errorVisible: false})
                                }}
                            >Close</PaperButton>
                        </View>
                    </View>
                </Modal>
                <Modal
                    animationType="fade"
                    transparent={true}
                    visible={this.state.helpShown}>
                    <TouchableWithoutFeedback onPress={() => {
                        this.setState({helpShown: false})
                    }}>
                        <View style={styles.modalOverlay}/>
                    </TouchableWithoutFeedback>

                    <View style={styles.parentView}>
                        <View style={styles.modalView}>
                            <Text>A tutorial video can be found here: link</Text>
                            <PaperButton
                                style={{marginTop: 10}}
                                mode="contained"
                                onPress={() => {
                                    this.setState({helpShown: false})
                                }}
                            >Close</PaperButton>
                        </View>
                    </View>
                </Modal>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 0,
        backgroundColor: "#FFFFFF"
    },
    content: {
        paddingLeft: 20,
        paddingRight: 20,
        marginBottom: 100,
        flex: 1
        //backgroundColor: '#438023'
    },
    heading: {
        padding: 0,
        backgroundColor: "#6200F2",
    },
    headingText: {
        color: "white",
        fontSize: 20,
        padding: 20,
    },
    dropdown: {
        backgroundColor: "#FFFFFF",
    },
    fab: {
        position: "absolute",
        right: 15,
        bottom: 15,
    },
    listComponent: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        padding: 10,
        backgroundColor: "#f4f4f4"

    },
    sensorListItem: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },

    labelListItem: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        height: 60,
        paddingRight: 10,
        paddingLeft: 10,
        marginBottom: 10,
        backgroundColor: "#f4f4f4"
    },
    labelListFooter: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        height: 60,
        paddingRight: 10,
        paddingLeft: 10,
        backgroundColor: "#f4f4f4"
    },

    iconButon: {
        marginRight: "auto",
        margin: 5,
        width: 35,
        height: 35,
    },

    infoButton: {
        marginRight: 15,
        margin: 5,
        width: 25,
        height: 25,
    },

    pickerIcon: {
        width: 24,
        height: 24
    },

    modalView: {
        margin: 30,
        backgroundColor: "white",
        borderRadius: 20,
        padding: 20,
        alignItems: "flex-start",
        shadowColor: "#000000",
        shadowOffset: {
            width: 0,
            height: 2
        },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5
    },

    parentView: {
        flex: 1,
        justifyContent: "flex-end",
        alignItems: "center",
    },

    capitalise: {
        textTransform: "capitalize",
        paddingBottom: 10,
    },

    sensorDescriptions: {
        paddingBottom: 10,
    },

    closeModal: {
        marginTop: 10,
        alignSelf: 'center'
        //marginLeft: 100,
        //marginRight: 100,
    },

    modalOverlay: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.5)'
    },

    errorView: {
        margin: 30,
        backgroundColor: "white",
        borderRadius: 20,
        padding: 20,
        alignItems: "center",
        shadowColor: "#000000",
        shadowOffset: {
            width: 0,
            height: 2
        },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5
    },

    errorText: {
        alignItems: "center",
        textAlign: "center",
    },

    descriptionText: {
        color: "lightgray",
        position: "relative",
        left: -25,
    },

    sensorInactive: {
        height: 25,
        color: "red",
    },

    title: {
        color: "white",
        textAlign: "left",
        fontWeight: "bold",
        fontSize: 20,
        marginLeft: 10,
        width: "60%",
    }
});

//export default StackNav

export default NewRecordingScreen;
