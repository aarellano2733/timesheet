<script type="text/javascript">

//VARIABLES & INITIAL SETUP
		currentTimesheet = null;//this is a global var to track which timesheet the user is
		currentEvent = null;//global var to track which TSI is currently selected. This is updated each time the user clicks on a timesheet item or creates one in any fashion
		unsavedTSIName = "Unsaved\r\n";
		//lookupFields is the list of the related object API names that are connect to TSIs. This serves as the keys for the event.relatedObjMap AND the names of the related fields on the TSI objects
		lookupFields = ["Capital_Project__c", "Capital_Subproject__c", "Internal_Service_Order__c", "Case__c", "Service__c", "Opportunity__c", "Account__c", "Real_Estate_Project__c"];
		lookupFieldElementMap = {};//this will map from the values in lookupFields to their respective HTML text fields
		deletedTimesheetItems = [];//list of deleted timesheet items, used for uploading to the database
		clonedTimesheetItem = null;//basically the 'clipboard', copy of the copied timesheet item is stored here
		clonedEventLookupFields = {};
		keys = [];//which keys are currently pressed. True = pressed, false = not pressed
		minEventDuration = 600;//if an event is shorter than this time(in seconds) when the user attempts to create an event, then it will not be created.
		offset = new Date().getTimezoneOffset()*60*1000;//getTimezoneOffset is in minutes, 60*1000 ms per minute, the times are given in ms since 1970
		sforce.connection.sessionId = "{!$Api.Session_ID}";
		userID = sforce.connection.getUserInfo().userId;
		LOG = [];
		colorMap = {};
		maxLogLength = 10;
		logTitleText = "Database Log: <br/>";
		ECtoPAmap = {};//map of earnings codes -> Project activities, populated on startup

		//FUNCTIONS

		//queries the database for a timesheet with a start date the same as 'start's week's start date and a same user as the current user.
		function loadTimesheet(start){
		    startOfWeek = new Date(start);//passing in a different start value will set the state to another day!
		    var queryList = [(startOfWeek.getUTCMonth()+1)+"/"+startOfWeek.getUTCDate()+"/"+startOfWeek.getUTCFullYear(), userID];
		    TimesheetInterfaceController.getTimesheet( queryList ,//sends the date and the user ID; you don't need to stringify this, through the power of mag- APEX!
		        function(result, event){
		            console.log(result);
		            if( !result || result.length == 0){ //if result is null, aka there is no timesheet, we want to create a timesheet
		                console.log("Timesheet for this week does not exist in the database, creating one");
		                createTimesheet(startOfWeek);
		            }else{
		                currentTimesheet = result;
		                TimesheetInterfaceController.getTimesheetItems( queryList ,//no need to stringify here too!
		                    function(result,event){
		                        $('#calendar').fullCalendar( 'removeEvents' );
		                        if(result)
		                            populateCalendar(result);
		                    }
		                );
		            }
		        }
		    );
		}
		//takes in TSIs, creates their corresponding events, attaches them to the events, and renders the events
		function populateCalendar(timesheetItems){
		    $('#calendar').fullCalendar('removeEvents');//clear events from the calendar
		    for(var i = 0; i < timesheetItems.length; i++){
		        //eventTitle = timesheetItems[i].Name + "\r\n" + "TIMESHEET ITEM ISO";
		        var newEvent = {
		            id: timesheetItems[i].Name,//IDs will be unique and used for lookup
		            title: timesheetItems[i].Name + "\r\n",//title is the text that is displayed on the calendar, will use this for dislaying relavent info about the TSI
		            start: timesheetItems[i].Start_Time__c - offset,
		            end: timesheetItems[i].End_Time__c - offset,
		            borderColor: unselectedColor,
		            backgroundColor: colorMap[timesheetItems[i].Earnings_Code__c],
		            textColor: 'black',
		            timesheetItem: timesheetItems[i]
		        };
		        //newEvent
		        setupRelatedObjMap(newEvent);
		        $('#calendar').fullCalendar('renderEvent', newEvent, true);//this actually adds the event to the calendar
		    }
		}
		//sets up the TSI's object map, each TSI can have a Cap proj, CSP, ISO, etc.
		function setupRelatedObjMap(newEvent){
		    //query is a 2D string list.
		    //query[0] is a list containing ["name OR id(this is what you're SELECTING)","the id or name to query for"]
		    //query[1] is a list containing ["id or name(This is what you're WHERE clause has)",""] see getObjects to see how it is parsed into a query
		    var query = [["name",newEvent.timesheetItem.Name + ""],["id",""]];//GET the name when ID = value
		    for(var i = 0; i < lookupFields.length;i++){
		        if(newEvent.timesheetItem[lookupFields[i]]){
		            var id = newEvent.timesheetItem[lookupFields[i]];
		            query.push([lookupFields[i], id]);
		        }
		    }
		    if(query.length > 2){//don't query if the length is only 2, which means the event didn't have any related objects
		        TimesheetInterfaceController.getObjects( JSON.stringify(query),
		            function(result,event){
		                //result is a 2D array of strings. for each element, the values are [x][0] = the Name of the lookup field(Capital_Project__c), [x][1] = the value of that field. we want to tie
		                //if the result actually has info. The last element will always be the ID of the timesheet item we want to tie this information to. This needs to be passed through because the timesheet(event) might be recreated in the time it takes for the query to execute
		                if(result.length > 1){
		                    var events = $('#calendar').fullCalendar('clientEvents');//get all of the events. We have to lookup the event again because 'renderevent' creates a new semi-copied event and adds it to a new list
		                    for(var i = 0; i < events.length; i++){
		                        //lookup the correct event by ID
		                        if(events[i].timesheetItem.Name == result[result.length-1][0]){
		                            //found the event, now tie all of the fields. We goto each lookupfield in events[i] and add the corresponding value.
		                            for(var j = 0; j < result.length-1; j++)
		                                events[i][result[j][0]] = result[j][1];
		                            events[i].title = createEventTitle(events[i]);
		                            $('#calendar').fullCalendar('rerenderEvents');
		                            break;
		                        }
		                    }
		                }
		            }
		        );
		    }
		}
		//creates an event title based on the lookupField values in the event. the event title is the text displayed inside it on the calendar
		function createEventTitle(curEvent){
		    var returnString = curEvent.timesheetItem.Name;
		    for(var i = 0; i < lookupFields.length; i++)
		        if(curEvent[lookupFields[i]])
		            returnString = returnString + "\r\n" + lookupFields[i].match(/[A-Z]+/g).join("") + ": " + curEvent[lookupFields[i]];
		    return returnString;
		}
		//adds an entry to the log, removes entries if there are > loglength
		function addToLog(entry){
		    LOG.push(entry);
		    if(LOG.length > maxLogLength)
		        LOG.shift();
		    var logString = logTitleText;
		    for(var i = 0; i < LOG.length; i++)
		        logString += (i+1) + ": " + LOG[i] + "<br/>";
		    document.getElementById("debug").innerHTML = logString;
		}

		//gets the current timesheet and timesheet items and submits them appropriately to the database
		function uploadTimesheet(){
		    document.getElementById("upload").disabled = true;
		    document.getElementById("upload").innerHTML = "uploading";
		    events = $('#calendar').fullCalendar('clientEvents');

		    console.log( "Events: " );
		    console.log( events );
		    console.log( "Current Timesheet: " );
		    console.log( currentTimesheet );

		    temp = [currentTimesheet];
		    TimesheetInterfaceController.pushTimesheet( JSON.stringify(temp) ,
		        function(result, event){
		            console.log("Timesheet: ", currentTimesheet);
		            console.log("Uploading Timesheet: ", result);
		            addToLog("Uploading Timesheet: " + result);
		        }
		    );

		    var TSIsToUpload = [];
		    for(var i = 0; i < events.length; i++)
		        TSIsToUpload.push(events[i].timesheetItem);

		    TimesheetInterfaceController.deleteTimesheetItems(JSON.stringify( deletedTimesheetItems ),
		        function(result, event){
		            console.log("Deleting Timesheet Items: ", result);
		            console.log(result);

		            document.getElementById("upload").innerHTML = "Save Changes";
		            document.getElementById("upload").disabled = false;
		            deletedTimesheetItems = [];
		            clearFields();
		            //var parsedResult = result.substring(result.indexOf("first error:") + ("first error:").length);
		            addToLog("Deleting Timesheet Items: " + result);
		        }
		    );

		    TimesheetInterfaceController.pushTimesheetItems(JSON.stringify( TSIsToUpload ) ,
		        function(result, event){
		            console.log("Uploading Timesheet Items: ", result);
		            addToLog("Uploading Timesheet Items: " + result);
		        }
		    );

		    loadTimesheet(currentTimesheet.Week_Of__c);
		}
		//clears all UI/input fields except for EC/PA
		function clearFields(){
		    currentEvent = null;
		    document.getElementById("currentTSIHeader").innerHTML = "No Item Selected";
		    document.getElementById("startTime").value = "";
		    document.getElementById("endTime").value = "";
		    document.getElementById("totalTime").value = "";
		    for(var i = 0; i < lookupFields.length; i++)
		        lookupFieldElementMap[lookupFields[i]].value = "";
		}

		//if there is no timesheet found in the database, this is called, sets up a default timesheet
		function createTimesheet(startOfWeek){
		    currentTimesheet = {
		        Name: sforce.connection.getUserInfo().userFullName + "-" + (startOfWeek.getUTCMonth()+1) + "/" + startOfWeek.getDate() + "/" + startOfWeek.getUTCFullYear(),
		        Week_Of__c: startOfWeek.valueOf(),//first of the week, curr is the current day, curr.getDay() gets day of the week.
		        Employee__c: userID
		    };
		    var temp = [currentTimesheet];
		    console.log("Uploading: ", currentTimesheet);
		    addToLog("No Timesheet found on server, creating a new one")
		    console.log("Timesheet created, uploading: " , currentTimesheet);
		    TimesheetInterfaceController.pushTimesheet( JSON.stringify(temp) ,
		        function(result, event){
		            console.log("Returned: ", result);
		            var data = [(startOfWeek.getUTCMonth()+1)+"/"+startOfWeek.getUTCDate()+"/"+startOfWeek.getUTCFullYear(), userID];
		            TimesheetInterfaceController.getTimesheet( data,
		                function(result, event){
		                    console.log("Timesheet retrieved: ", result);
		                    currentTimesheet = result;//pushing and pulling it because the SF server will assign it an id
		                    addToLog("Pushed and pulled new timesheet: " + currentTimesheet);
		                }
		            );
		        }
		    );
		}

		//updates the event's attached timesheet item with the values of the event. this is used when an event is moved/changes
		function updateTimesheetItem( event ){
		    event.timesheetItem.Start_Time__c = event.start.valueOf() + offset;
		    event.timesheetItem.End_Time__c = event.end.valueOf() + offset;
		    event.timesheetItem.Date__c = event.start.valueOf() + offset - event.start.hour()*1000*60*60 - event.start.minute()*1000*60 - event.start.second()*1000 - event.start.millisecond();
		}

		//run once on startup, in main thread
		function setup(){
		    setupInputListeners();
		    var dependentOptions = getDependentOptions('Timesheet_Item__c', 'Earnings_Code__c', 'Type__c');
		    var possiblePicklistValues = sforce.connection.describeLayout('Timesheet_Item__c', ['01260000000Dqb1AAC']).recordTypeMappings.picklistsForRecordType;//01260000000Dqb1AAC=us timesheet item //[currentTimesheet.RecordTypeId]);
		    setupDependentOptions(possiblePicklistValues, dependentOptions);
		    setupColorMap();
		}
		//this is some weird stuff. EC is controlled by Record type, so earningsCodes is the final list of ECs the user can see
		//BUT Proj activity is controlled by Record type AND earnings code! YAY! So the code needs to make sure values are allowed by both
		function setupDependentOptions(possiblePicklistValues, dependentOptions){
		    //goto each recordTypeMapping
		    earningsCodes = [];
		    possibleProjectActivities = [];
		    for(var i = 0; i < possiblePicklistValues[1].picklistValues.length; i++)//index 1 = earnings code values
		        earningsCodes.push(possiblePicklistValues[1].picklistValues[i].value);
		    for(var i = 0; i < possiblePicklistValues[0].picklistValues.length; i++)//index 0 = project activity values
		        possibleProjectActivities.push(possiblePicklistValues[0].picklistValues[i].value);
		    for(var i = 0; i < earningsCodes.length; i++){
		        ECtoPAmap[earningsCodes[i]] = [];
		        for(var j = 0; j < possibleProjectActivities.length; j++){
		            if(dependentOptions[earningsCodes[i]].indexOf(possibleProjectActivities[j]) != -1){
		                ECtoPAmap[earningsCodes[i]].push(possibleProjectActivities[j]);
		            }
		        }
		    }
		}

		//gets the dependencies of a field and creates a map of them, not my code, I don't own this magic. Praise be to the stack overflow gods
		function getDependentOptions(objName, ctrlFieldName, depFieldName) {
		    // Isolate the Describe info for the relevant fields
		    var objDesc = sforce.connection.describeSObject(objName);
		    var ctrlFieldDesc, depFieldDesc;
		    var found = 0;
		    for (var i=0; i<objDesc.fields.length; i++) {
		        var f = objDesc.fields[i];
		        if (f.name == ctrlFieldName) {
		            ctrlFieldDesc = f;
		            found++;
		        } else if (f.name == depFieldName) {
		            depFieldDesc = f;
		            found++;
		        }
		        if (found==2) break;
		    }

		    // Set up return object
		    var dependentOptions = {};
		    var ctrlValues = ctrlFieldDesc.picklistValues;
		    for (var i=0; i<ctrlValues.length; i++) {
		        dependentOptions[ctrlValues[i].label] = [];
		    }

		    var base64 = new sforce.Base64Binary("");
		    function testBit (validFor, pos) {
		        var byteToCheck = Math.floor(pos/8);
		        var bit = 7 - (pos % 8);
		        return ((Math.pow(2, bit) & validFor.charCodeAt(byteToCheck)) >> bit) == 1;
		    }

		    // For each dependent value, check whether it is valid for each controlling value
		    var derpValues = depFieldDesc.picklistValues;
		    for (var i=0; i < derpValues.length; i++) {
		        var thisOption = derpValues[i];
		        var validForDec = base64.decode(thisOption.validFor);
		        for (var ctrlValue=0; ctrlValue < ctrlValues.length; ctrlValue++) {
		            if (testBit(validForDec, ctrlValue)) {
		                dependentOptions[ctrlValues[ctrlValue].label].push(thisOption.label);
		            }
		        }
		    }
		    //this is bad code. But until salesforce allows me to access record types and their respective picklist values.... I don't have another way.
		    //remove this when

		    return dependentOptions;
		}
		//sets up the color map of Earnings_Code__c -> Color of the event
		//also sets the un/selected colors for events when they are clicked on
		function setupColorMap(){
		    unselectedColor = '#ffffff';//"2222ee";
		    selectedColor =   '#000000';//"ee2222";colorMap = {};
		    var earningsCodes = Object.keys(ECtoPAmap);
		    var colors = ['#ffbb22','#888888','#6666dd','#1111ee','#22ff22','#ffffff','#eeee55']//7;
		    for(var i = 0; i < earningsCodes.length; i++)
		        colorMap[earningsCodes[i]] = colors[i];
		}
		//when an event is clicked on, this needs to be called. this populates the HTML fields and picklists with the information within the event/TSI
		function loadItemToForm(curEvent){
		    var curEventHeader = document.getElementById("currentTSIHeader");
		    curEventHeader.innerHTML = curEvent.title.substring(0,curEvent.title.indexOf("\r\n") );
		    if(curEventHeader.innerHTML.length == 0){
		        curEventHeader.innerHTML = "No Item Selected";
		        return;
		    }

		    populateTimeFields(curEvent);
		    populateLookupFields(curEvent);
		    populateEarningsCodeField(curEvent);
		    populateTotalTimeFields();
		}

		function populateTotalTimeFields(){
		    var totalTimeWorked = 0;
		    var totalCapTime = 0;
		    var events = $('#calendar').fullCalendar( 'clientEvents' );
		    for(var i = 0; i < events.length; i++){
		        totalTimeWorked += events[i].end.valueOf() - events[i].start.valueOf();
		        if(events[i].Capital_Project__c)
		            totalCapTime += events[i].end.valueOf() - events[i].start.valueOf();
		    }
		    document.getElementById("totalTimeWorked").value = duration(totalTimeWorked);
		    document.getElementById("totalCapTime").value = duration(totalCapTime);
		}

		//populates start time, end time, total time with values of event
		function populateTimeFields(event){
		    document.getElementById("startTime").value = event.start.format("hh:mm a");
		    document.getElementById("endTime").value = event.end.format("hh:mm a");
		    document.getElementById("totalTime").value = duration(event.end.valueOf() - event.start.valueOf());
		}
		//populates the various lookup fields associated with TSIs
		function populateLookupFields(event){
		    for(var i = 0; i < lookupFields.length; i++){
		        lookupFieldElementMap[lookupFields[i]].value = "";
		        if(event.timesheetItem[lookupFields[i]])
		            lookupFieldElementMap[lookupFields[i]].value = event[lookupFields[i]];
		    }
		}
		//takes in a time in MS and returns the duration in string "HH:MM" format
		function duration(time){
		    hours = Math.floor( time/(1000*60*60) );
		    minutes = Math.floor( time%(1000*60*60)/(1000*60) );
		    if(minutes < 10)
		        minutes = "0"+minutes;
		    return hours + ":" + minutes;
		}

		//Populates the earnings code dropdown menu based on the options map.
		function populateEarningsCodeField(curEvent){
		    if(!curEvent)
		        return;
		    var earningsCodeDropdown = document.getElementById("Earnings_Code__c");//("{!$Component.pg.apexFormECPA.Earnings_Code__c}");

		    //clear the children
		    while(earningsCodeDropdown.firstChild) {
		        earningsCodeDropdown.removeChild(earningsCodeDropdown.firstChild);
		    }
		    var earningsCodes = Object.keys(ECtoPAmap);
		    //populate the earnings code dropdown
		    for(var j = 0; j < earningsCodes.length; j++){
		        var option = document.createElement("option");
		        option.text = earningsCodes[j];
		        earningsCodeDropdown.add(option);
		    }

		    //if there is already a value for earnings code in the TSI, pass that.
		    if(currentEvent.timesheetItem.Earnings_Code__c != ""){
		        for(var i = 0; i < earningsCodeDropdown.options.length; i++){
		            if(earningsCodeDropdown.options[i].text == curEvent.timesheetItem.Earnings_Code__c){
		                earningsCodeDropdown.selectedIndex = i;
		                break;
		            }
		        }
		        populateProjectActivityField(curEvent, curEvent.timesheetItem.Earnings_Code__c);
		    }else{
		        currentEvent.timesheetItem.Earnings_Code__c = earningsCodes[0];
		        currentEvent.backgroundColor = colorMap[earningsCodes[0]];
		        populateProjectActivityField(currentEvent, earningsCodes[0]);
		    }
		    $('#calendar').fullCalendar( 'rerenderEvents' );
		}

		//adds entries to the Project Activity dropdown menu based on the current earnings code and the options map
		function populateProjectActivityField(currentEvent, newValue){
		    var projectActivityDropdown = document.getElementById("Type__c");//("{!$Component.pg.apexFormECPA.Type__c_values}");

		    var projectActivities = ECtoPAmap[newValue];
		    //var projectActivities = [];
		    //var projectActivityVFDD = document.getElementById("{!$Component.pg.apexFormECPA.Type__c_values}");
		    //console.log("VFDD: ", projectActivityVFDD);
		    //for(var v = 0; v < projectActivityVFDD.options.length; v++)
		    //    projectActivities.push(projectActivityVFDD.options[v].innerHTML);

		    //clears current entries in the dropdown menu
		    while (projectActivityDropdown.firstChild) {
		        projectActivityDropdown.removeChild(projectActivityDropdown.firstChild);
		    }
		    if(!projectActivities){//juuuust in case. Will likely remove later
		        var option = document.createElement("option");
		        option.text = "";
		        projectActivityDropdown.add(option);
		        return;
		    }

		    //populate values into project activities based on the current earnings code
		    for(var i = 0; i < projectActivities.length; i++){
		        var option = document.createElement("option");
		        option.text = projectActivities[i];
		        projectActivityDropdown.add(option);
		    }

		    //if currentEvent's timesheet item has a Type__c, get it and set the currently selected item to be it.
		    if(currentEvent.timesheetItem.Type__c != ""){
		        for(var i = 0; i < projectActivityDropdown.options.length; i++){
		            if(projectActivityDropdown.options[i].text == currentEvent.timesheetItem.Type__c){
		                projectActivityDropdown.selectedIndex = i;
		                break;
		            }
		        }
		    }else{//otherwise, just set it to default, which is the first value. Later on might want to track the previously used value to save time
		        currentEvent.timesheetItem.Type__c = projectActivities[0];//setProjectActivity(projectActivities[0]);
		    }
		}
		//used to verify user input. Takes a string of format "HH:MM"
		function verifyTotalTime(timeString){
		    timeString = timeString.replace(/\s+/g, '');//
		    if( timeString.indexOf(":") == 1 )
		        timeString = "0" + timeString;
		    var hourString   = timeString.substring(0,2);
		    var minuteString = timeString.substring(3,5);
		    if(timeString.length != 5){
		        return false;
		    }else if( timeString.charAt(2) != ":"){//Check if semi colon is in the right place
		        return false;
		    }else if( !(/^\d+$/.test(hourString)) || parseInt( hourString ) < 0 || parseInt( hourString ) > 12 ){//check if hours only contains numbers AND 0 < hours <= 12
		        return false;
		    }else if( !(/^\d+$/.test(minuteString)) || parseInt( minuteString ) < 0 || parseInt( minuteString ) > 59 ){//check if minutes only contains numbers AND 0 <= MINUTES < 60
		        return false;
		    }
		    return true;
		}
		//used to verify user input, takes a string of format "HH:MM:SS AM"
		function verifyTimeString(timeString){
		    timeString = timeString.replace(/\s+/g, '');//
		    if( timeString.indexOf(":") == 1)
		        timeString = "0" + timeString;

		    var hourString   = timeString.substring(0,2);
		    var minuteString = timeString.substring(3,5);
		    //var secondString = timeString.substring(6,8);
		    var ampmString  = timeString.substring(5).toLowerCase();//timeString.substring(8).toLowerCase();

		    if(timeString.length != 7){
		        return "Incorrect length. Actual(with whitespace removed): '" + timeString + "' of length: " + timeString.length;
		    }else if( timeString.charAt(2) != ":" ){//|| timeString.charAt(5) != ":"){//Check if semi colons are in the right place
		        return "Misplaced ':'";
		    }else if( !(ampmString == "am" || ampmString == "pm") ){
		        return "Incorrect am/pm formatting: " + timeString;
		    }else if( !(/^\d+$/.test(hourString)) || parseInt( hourString ) < 1 || parseInt( hourString ) > 12 ){//check if hours only contains numbers AND 0 < hours <= 12
		        return "Invalid hours input";
		    }else if( !(/^\d+$/.test(minuteString)) || parseInt( minuteString ) < 0 || parseInt( minuteString ) > 59 ){//check if minutes only contains numbers AND 0 <= MINUTES < 60
		        return "Invalid minutes input";
		    }
		    return "";
		}
		//takes in a string of format "HH:MM:SS AM" and returns the total time in MS
		function timeToMS(timeString){
		    timeString = timeString.replace(/\s+/g, '');//remove all whitespace
		    if( timeString.indexOf(":") == 1){
		        timeString = "0" + timeString;
		    }

		    var ampm = 0;
		    if(timeString.slice(-2) == "pm" )//get the half of the day
		        ampm = 12*60*60*1000;//ampm = 12 hours in ms

		    var hours  =  parseInt( timeString.substring(0,2) )%12;
		    var minutes = parseInt( timeString.substring(3,5) );
		    var seconds = 0;//parseInt( timeString.substring(6,8) );//previously allowed users to input seconds for start/end times, but that's tmi

		    return ampm + hours*60*60*1000 + minutes*60*1000 + seconds*1000;
		}
		//deletes the currently selected timesheet item
		function deleteCurrentTSI(){
		    if(!currentEvent)
		        return;

		    deletedTimesheetItems.push(currentEvent.timesheetItem);
		    //remove the event from the calendar
		    $('#calendar').fullCalendar( 'removeEvents', currentEvent.id );//BUG IS HERE
		    //redraw the calendar
		    $('#calendar').fullCalendar( 'rerenderEvents' );
		    currentEvent = null;
		}
		//used to check the Time Snap Interval. Checks the "MM" string to see if it's valid. Cuz you can't trust them users
		function isValidTimeInterval(timeInterval){
		    timeInterval = timeInterval.replace(/\s+/g, '');//remove that pesky whitespace
		    var minuteString = timeInterval.substring(0,2);//just in case

		    if(timeInterval.length >2 || timeInterval.length == 0 ){
		        console.log("incorrect length:\"" + timeInterval + "\"");
		        return false;//return "Incorrect length. Actual(with whitespace removed): '" + timeInterval + "' of length: " + timeInterval.length;
		    }else if( !(/^\d+$/.test( minuteString )) || parseInt( minuteString ) < 0 || parseInt( minuteString ) > 10 ){//check if minutes only contains numbers AND 0 <= MINUTES < 60
		        console.log("minutes invalid:\"" + timeInterval + "\"");
		        return false;//return "Invalid minutes input";
		    }
		    return true;
		}
		//creates a deep copy of the Timesheet Item passed in.
		function cloneTimesheetItem(TSI){
		    var numEvents = $('#calendar').fullCalendar( 'clientEvents' ).length;
		    var clone = {
		        Name: "" + numEvents,
		        CurrencyIsoCode: TSI.CurrencyIsoCode,
		        Date__c: TSI.Date__c,
		        Start_Time__c: null,
		        End_Time__c: null,
		        Timesheet__c: TSI.Timesheet__c,
		        Earnings_Code__c: TSI.Earnings_Code__c,
		        Type__c: TSI.Type__c
		    }
		    for(var i = 0; i < lookupFields.length; i++){
		        if(TSI[lookupFields[i]]){
		            clone[lookupFields[i]] = TSI[lookupFields[i]];
		            clonedEventLookupFields[lookupFields[i]] = currentEvent[lookupFields[i]];
		        }
		    }
		    return clone;
		}
		//I bet you can figure this one out. (creates a new event, based on the times it's given)
		function createNewEvent(start, end, TSI){
		    var numEvents = $('#calendar').fullCalendar( 'clientEvents' ).length;
		    var newEvent= {
		        title: unsavedTSIName,
		        id: TSI.Name,
		        start: start,
		        end: end,
		        borderColor: unselectedColor,
		        backgroundColor: '#ffbb22',
		        textColor: 'black',
		        timesheetItem: TSI
		    };
		    return newEvent;
		}
		//Creates a default (blank) Timesheet Item based on the start/end times
		function createDefaultTSI(start, end){
		    var numEvents = $('#calendar').fullCalendar( 'clientEvents' ).length;
		    newTimesheetItem = {
		        Name: unsavedTSIName + numEvents,
		        CurrencyIsoCode:"USD",
		        Date__c: start.valueOf() - start.hour()*1000*60*60 - start.minute()*1000*60 - start.second()*1000 - start.millisecond(),// + offset
		        Start_Time__c: start.valueOf() + offset,
		        End_Time__c: end.valueOf() + offset,
		        Timesheet__c: currentTimesheet.Id,
		        Earnings_Code__c: "",
		        Type__c: "",
		        Capital_Project__c: "",
		        Capital_Subproject__c: "",
		        Service_Order__c: "",
		        Internal_Service_Order__c: "",
		        Case__c: "",
		        Service: "",
		        Opportunity: "",
		        Account__c: "",
		        Real_Estate_Project__c: ""
		    };
		    return newTimesheetItem;
		}
		//sets the currently selected event to the one passed in, sets border colors of all events to unselected, sets selected event to selected color
		function setCurrentEvent(event){
		    currentEvent = event;
		    events = $('#calendar').fullCalendar( 'clientEvents' );
		    for(var i = 0; i < events.length; i++)
		        events[i].borderColor = unselectedColor;
		    currentEvent.borderColor = selectedColor;
		}
		//CALENDAR: Please see fullcalendar.io/docs for information on using the fullcalendar.io API
		//this is where the calendar is set up with jQuery, all this stuff and how to use it is in the documetation
		$(document).ready(function() {
		    $('#calendar').fullCalendar({
		        //sets the header buttons. This is where you need to add buttons to allow the user to change the week!
		        header: {
		            left:   'upload',
		            center: '',
		            right:  'today prev,next'
		        },
		        //event creation code, this is what is called when you click-drag to create an event
		        select: function(start, end) {
		            //var numEvents = $('#calendar').fullCalendar( 'clientEvents' ).length;
		            var newEvent;
		            var mEnd = $.fullCalendar.moment(end);
		            var mStart = $.fullCalendar.moment(start);

		            if ( mStart.day() != mEnd.day() || moment.duration(end.diff(start)).asSeconds() < minEventDuration ) {//if start and end are not on the same day OR the total duration is shorter than minEventDuration, don't create the event
		                return;
		            }else{
		                if(!clonedTimesheetItem || clonedTimesheetItem == null){//if there is not a cloned timesheet item, make a default one
		                    console.log("Creating new Timesheet Item");
		                    newEvent = createNewEvent(start, end, createDefaultTSI(start, end));
		                    $('#calendar').fullCalendar('renderEvent', newEvent, true); // stick? = true
		                    events = $('#calendar').fullCalendar('clientEvents');
		                    for(var i = 0; i < events.length; i++){//you have to manually find the event once it's created because the event you pass in DOES NOT just get added to a list, it gets recreated. This causes problems.
		                        if(events[i].start.valueOf() == newEvent.start.valueOf()){
		                            setCurrentEvent(events[i]);
		                        }
		                    }
		                    loadItemToForm(newEvent);
		                }else{//otherwise, there is a cloned timesheet item! K so now we create new stuff based on that TSI and add the TSI to the list of TSIs
		                    console.log("Creating new TSI based on cloned one", clonedTimesheetItem);
		                    newEvent = createNewEvent(start, end, clonedTimesheetItem);
		                    var validLookupfields = Object.keys(clonedEventLookupFields);
		                    for(var i = 0; i < validLookupfields.length; i++){
		                        newEvent[validLookupfields[i]] = clonedEventLookupFields[validLookupfields[i]];
		                    }
		                    newEvent.title = createEventTitle(newEvent);

		                    newTimesheetItem = clonedTimesheetItem;
		                    newTimesheetItem.Start_Time__c = newEvent.start.valueOf() + offset;
		                    newTimesheetItem.End_Time__c = newEvent.end.valueOf() + offset;
		                    newTimesheetItem.Date__c = newEvent.start.valueOf() + offset - newEvent.start.hour()*1000*60*60 - newEvent.start.minute()*1000*60 - newEvent.start.second()*1000 - newEvent.start.millisecond();


		                    clonedTimesheetItem = null;
		                    clonedEventLookupFields = {};

		                    newEvent.backgroundColor = colorMap[newEvent.timesheetItem.Earnings_Code__c];
		                    events = $('#calendar').fullCalendar('clientEvents');
		                    for(var i = 0; i < events.length; i++){//you have to manually find the event once it's created because the event you pass in DOES NOT just get added to a list, it gets recreated. This causes problems.
		                        if(events[i].start.valueOf() == newEvent.start.valueOf()){
		                            setCurrentEvent(events[i]);
		                        }
		                    }
		                    loadItemToForm(newEvent);
		                    newEvent.backgroundColor = colorMap[newEvent.timesheetItem.Earnings_Code__c];
		                    $('#calendar').fullCalendar('renderEvent', newEvent, true); // stick? = true
		                    $('#calendar').fullCalendar( 'rerenderEvents' );

		                }
		            }
		            $('#calendar').fullCalendar('unselect');

		        },
		        //called when an event is clicked on
		        eventClick: function(calEvent, jsEvent, view) {
		            setCurrentEvent(calEvent);
		            loadItemToForm( calEvent );

		            $('#calendar').fullCalendar( 'rerenderEvents' );

		            console.log("Clicked On: ", calEvent);//leaving this one in
		        },
		        //this is called when a user clicks on a day. So outside of an event but inside the calendar. Leaving this in in case someone needs to add stuff
		        dayClick: function(date, jsEvent, view) {},
		        //called on page load, pretty much the entry point, this is called each time the week is changed, which causes the page toe ssentially refresh
		        events: function(start, end, timezone, callback){//start = start of week, end = end of week
		            setup();
		            loadTimesheet( start );
		        },
		        //called when you click and begin dragging on an event, this immediately sets the current event to the one you clicked on, as opposed to setting it when you release, looks better this way
		        eventDragStart: function(event, jsEvent, ui, view){
		            setCurrentEvent(event);
		        },
		        //called when you stop dragging an event(release the mouse button)
		        eventDrop: function( event, jsEvent, ui, view ){//called when you stop dragging the event
		            updateTimesheetItem( event );
		            loadItemToForm( event );
		            $('#calendar').fullCalendar( 'rerenderEvents' );
		        },
		        //called when you resize the event, specifically when you release the mouse button
		        eventResize: function( event, jsEvent, ui, view ){
		            setCurrentEvent(event);
		            updateTimesheetItem( event );
		            loadItemToForm( event );
		            $('#calendar').fullCalendar( 'rerenderEvents' );
		        },
		        minEventDuration: 5*60,//this is in seconds! if the user makes an event shorter than this length, it just won't be created. All those accidental 1min events are annoying
		        minTime: '04:00:00',//start time of the day
		        maxTime: '19:00:00',//end time of the day
		        height: 915,//height of the calendar in pixels
		        //contentHeight: 760,
		        //aspectRatio:1,
		        snapDuration: '00:01:00',//
		        defaultView: 'agendaWeek',
		        selectable: true,//can you click on an event
		        selectHelper: true,//Whether to draw a "placeholder" event while the user is dragging.
		        editable: true,//can events be modified?
		        eventLimit: false,//limits the number of events displayed on a day
		        selectOverlap: false,//can the user create an event by dragging that is overlapping other events?
		        eventOverlap : false,//can events overlap when the user is dragging?
		        allDaySlot: false,//is there an all day event slot?
		        color: '1111ee',
		        slotDuration: '00:20:00',//self explanitory, but this also changes the 'fidelity' of the calendar slots. higher = smaller calendar, best to leave this alone
		        //displayEventTime:false,//display the start time of an event at the top of the event?
		        //displayEventEnd: false,//display the end time at the top of the event?
		        backgroundColor: 'ffbb22',
		        textColor: 'black'//,  eventBorderColor: '#ffffff'
		    });
		});

		//self explanitory. All input listeners should be set up in here
		function setupInputListeners(){
		    document.getElementById("Earnings_Code__c").addEventListener('input', saveECandPA);//this IS a VF component, type__c ISNT, because the input listener just will not fire on type__c. thanks salesforce.
		    document.getElementById("Type__c").addEventListener('input', saveECandPA);//this is the line to add an input listener to the Type__c field
		    //document.getElementById("Type__c").addEventListener('input', saveECandPA);

		    document.getElementById("startTime").addEventListener('input', saveStartEndTime);
		    document.getElementById("endTime").addEventListener('input', saveStartEndTime);

		    document.getElementById("timeInterval").addEventListener('input', saveTimeInterval);

		    document.getElementById("totalTime").addEventListener('input', saveTotalTimeField);

		    //have to do this DECLARATIVELY because salesforce can't dynamically use Component.pg.apexForm.[STRING_OF_ELEMENT_ID]; this is because it preprocesses these strings, before the page begins to execute
		    lookupFieldElementMap["Capital_Project__c"] = document.getElementById("{!$Component.pg.apexFormLookupFields.Capital_Project__c}")
		    lookupFieldElementMap["Capital_Project__c"].addEventListener('change', saveLookupFields );

		    lookupFieldElementMap["Capital_Subproject__c"] = document.getElementById("{!$Component.pg.apexFormLookupFields.Capital_Subproject__c}")
		    lookupFieldElementMap["Capital_Subproject__c"].addEventListener('change', saveLookupFields );

		    lookupFieldElementMap["Internal_Service_Order__c"] = document.getElementById("{!$Component.pg.apexFormLookupFields.Internal_Service_Order__c}")
		    lookupFieldElementMap["Internal_Service_Order__c"].addEventListener('change', saveLookupFields );

		    lookupFieldElementMap["Case__c"] = document.getElementById("{!$Component.pg.apexFormLookupFields.Case__c}")
		    lookupFieldElementMap["Case__c"].addEventListener('change', saveLookupFields );

		    lookupFieldElementMap["Service__c"] = document.getElementById("{!$Component.pg.apexFormLookupFields.Service__c}")
		    lookupFieldElementMap["Service__c"].addEventListener('change', saveLookupFields );

		    lookupFieldElementMap["Opportunity__c"] = document.getElementById("{!$Component.pg.apexFormLookupFields.Opportunity__c}")
		    lookupFieldElementMap["Opportunity__c"].addEventListener('change', saveLookupFields );

		    lookupFieldElementMap["Account__c"] = document.getElementById("{!$Component.pg.apexFormLookupFields.Account__c}")
		    lookupFieldElementMap["Account__c"].addEventListener('change', saveLookupFields );

		    lookupFieldElementMap["Real_Estate_Project__c"] = document.getElementById("{!$Component.pg.apexFormLookupFields.Real_Estate_Project__c}")
		    lookupFieldElementMap["Real_Estate_Project__c"].addEventListener('change', saveLookupFields );

		    window.onkeydown = keyDown;
		    window.onkeyup = keyUp;
		}

		//saves all the lookup fields to the current event's timesheet item
		function saveLookupFields(){
		    if(!currentEvent)
		        return;

		    var query = [["id",currentEvent.timesheetItem.Name + ""],["Name",""]];//get the ID when NAME = value. the currentEvent.timesheetItem.Id is passed through to the anonymous callback function so it knows which TSI to add the returned values to

		    //goto each lookupfield in currentEvent
		    for(var i = 0; i < lookupFields.length; i++){
		        if(lookupFieldElementMap[lookupFields[i]].value && lookupFieldElementMap[lookupFields[i]].value != currentEvent[lookupFields[i]]){//if there is a value in the field AND that value is different than the current one
		            currentEvent[lookupFields[i]] = lookupFieldElementMap[lookupFields[i]].value;
		            //found the fields with values, now save each of them to the current event
		            query.push([lookupFields[i], lookupFieldElementMap[lookupFields[i]].value]);
		        }
		    }
		    TimesheetInterfaceController.getObjects(JSON.stringify(query),
		        function(result,event){
		            if(result && result.length > 1){
		                var events = $('#calendar').fullCalendar( 'clientEvents' );//get all of the events. We have to lookup the event again because 'renderevent' creates a new semi-copied event and adds it to a new list
		                for(var i = 0; i < events.length; i++){
		                    //lookup the correct event by ID
		                    if(events[i].timesheetItem.Name == result[result.length-1][0]){
		                        //found the event, now tie all of the fields. We goto each lookupfield in events[i] and add the corresponding value.
		                        for(var j = 0; j < result.length-1; j++){
		                            events[i].timesheetItem[result[j][0]] = result[j][1];
		                            //console.log("Saved: ", result[j][0], " as: ", result[j][1]);
		                        }
		                        currentEvent.title = createEventTitle(currentEvent);
		                        loadItemToForm(currentEvent);
		                        $('#calendar').fullCalendar('rerenderEvents');
		                        break;
		                    }
		                }
		            }else{
		                console.log("Error executing query; returned: ", result);
		            }
		        }
		    );

		}
		//saves earnings code and project activity dropdowns/picklists
		function saveECandPA(){//this needs to be separated out into EC and PA
		    if(!currentEvent || !currentEvent.timesheetItem){
		        console.log("No event is currently selected, nothing saved.");
		        return;
		    }
		    console.log(ECtoPAmap);
		    var earningsCodeDD = document.getElementById("Earnings_Code__c");
		    var selectedEarningsCode = earningsCodeDD.options[earningsCodeDD.selectedIndex].text;
		    //if earnings code has changed
		    if(earningsCodeDD.options[earningsCodeDD.selectedIndex].text != currentEvent.timesheetItem.Earnings_Code__c){
		        //currentEvent.timesheetItem.Type__c = "";
		        populateProjectActivityField(currentEvent, earningsCodeDD.options[earningsCodeDD.selectedIndex].text);//earningsCodeDD.options[earningsCodeDD.selectedIndex].text);
		    }

		    var projectActivityDD = document.getElementById("Type__c");
		    var selectedProjectActivity = projectActivityDD.options[projectActivityDD.selectedIndex].text;
		    //update the current timesheets earnings code and project activity/type
		    currentEvent.timesheetItem.Earnings_Code__c = selectedEarningsCode;
		    currentEvent.timesheetItem.Type__c = selectedProjectActivity;
		    console.log("EC&PA: " + selectedEarningsCode + ", " + selectedProjectActivity);

		    //sets the new color of the event
		    currentEvent.backgroundColor = colorMap[currentEvent.timesheetItem.Earnings_Code__c];
		    $('#calendar').fullCalendar( 'rerenderEvents' );
		    populateTotalTimeFields();
		}
		//saves the start and end time
		function saveStartEndTime(){
		    if(!currentEvent.timesheetItem){
		        console.log("No event is currently selected, nothing saved.");
		        return;
		    }
		    //grabs the time from the text box, just in case
		    var startString = document.getElementById("startTime").value;
		    var endString = document.getElementById("endTime").value;

		    var startVerify = verifyTimeString(startString);
		    var endVerify = verifyTimeString(endString);
		    if( startVerify ){//shouldnt this be !startVerify
		        console.log("Invalid Start Time String: " + startVerify);
		    }else if( endVerify ){
		        console.log("Invalid end Time String: " + endVerify);
		    }else{
		        startTime = timeToMS(startString);
		        endTime = timeToMS(endString);

		        if(startTime < endTime){
		            currentEvent.timesheetItem.Start_Time__c = currentEvent.timesheetItem.Date__c + startTime + offset;// + offset
		            currentEvent.timesheetItem.End_Time__c = currentEvent.timesheetItem.Date__c + endTime + offset;
		            currentEvent.start.add(startTime - timeToMS( currentEvent.start.format("hh:mm a") ), 'ms');// = currentEvent.timesheetItem.Date__c + startTime;
		            currentEvent.end.add(endTime - timeToMS( currentEvent.end.format("hh:mm a") ), 'ms');
		        }else{
		            console.log("Start time must be before end time");
		        }
		    }
		    document.getElementById("totalTime").value = duration( currentEvent.end.valueOf() - currentEvent.start.valueOf() );
		    $('#calendar').fullCalendar( 'rerenderEvents' );
		    populateTotalTimeFields();
		}

		//saves the snap duration
		function saveTimeInterval(){
		    var timeInterval = $('#timeInterval').val();
		    if(isValidTimeInterval(timeInterval))
		        $('#calendar').fullCalendar('option', 'snapDuration', "00:" + timeInterval + ":00");
		}
		//saves the total time. Updates end time of the event
		function saveTotalTimeField(){
		    if(!currentEvent.timesheetItem){
		        console.log("No event is currently selected, nothing saved.");
		        return;
		    }
		    var totalTimeField = document.getElementById("totalTime");
		    var totalTimeString = totalTimeField.value + "";
		    if(verifyTotalTime(totalTimeString)){//needs to check if the new end time will cause a collision; && !overlaps(currentEvent.timesheetItem, 0)
		        var totalTimeMS = parseInt(totalTimeString.substring(0,totalTimeString.indexOf(":")) )*60*60*1000 + parseInt(totalTimeString.substring(totalTimeString.indexOf(":")+1,5))*60*1000
		        //if the total time in the box is valid AND is different than the actual total time, then change end time accordingly.
		        if(totalTimeMS && totalTimeMS != (currentEvent.end.valueOf() - currentEvent.start.valueOf()) ){
		            currentEvent.end.add((currentEvent.start.valueOf() + totalTimeMS) - currentEvent.end.valueOf());
		            currentEvent.timesheetItem.End_Time__c = currentEvent.timesheetItem.Start_Time__c + totalTimeMS;
		        }
		    }
		    document.getElementById("endTime").value = currentEvent.end.format("hh:mm:ss a");
		    $('#calendar').fullCalendar( 'rerenderEvents' );
		    populateTotalTimeFields();
		}

		//checks which keys have been pressed and takes actions accordingly
		function keyboardHandler(){
		    var increment = 60000;//1 min = 60000
		    if(keys[46]){//delete
		        deleteCurrentTSI();
		    }
		    else if(keys[38] && !overlaps(currentEvent.timesheetItem, -1*increment) && currentEvent){//up arrow
		        currentEvent.start.subtract(increment, 'ms');
		        currentEvent.timesheetItem.Start_Time__c -= increment;

		        currentEvent.end.subtract(increment, 'ms');
		        currentEvent.timesheetItem.End_Time__c -= increment;

		        loadItemToForm(currentEvent);
		    }else if(keys[40] && !overlaps(currentEvent.timesheetItem, increment)  && currentEvent){//down arrow
		        currentEvent.start.add(increment, 'ms');
		        currentEvent.timesheetItem.Start_Time__c += increment;

		        currentEvent.end.add(increment, 'ms');
		        currentEvent.timesheetItem.End_Time__c += increment;

		        loadItemToForm(currentEvent);
		    }
		    else if(keys[17]){//ctrl
		        if(keys[67]){//c = 67, v = 86
		            clonedTimesheetItem = cloneTimesheetItem(currentEvent.timesheetItem);//this should be refactored later
		            console.log("Cloning current timesheet item", clonedTimesheetItem);
		        }else if(keys[86]){
		            //this would be ctrl+v code. But not needed
		        }
		    }
		}
		//returns true if the timesheetItem will overlap with other timesheet items
		function overlaps(timesheetItem, increment){
		    var events = $('#calendar').fullCalendar( 'clientEvents' );
		    for(var i = 0; i < events.length; i++){
		        if(( (timesheetItem.End_Time__c + increment > events[i].timesheetItem.Start_Time__c && timesheetItem.End_Time__c + increment < events[i].timesheetItem.End_Time__c)
		                || (timesheetItem.Start_Time__c + increment < events[i].timesheetItem.End_Time__c && timesheetItem.Start_Time__c + increment > events[i].timesheetItem.Start_Time__c) )
		          && timesheetItem.Start_Time__c != events[i].timesheetItem.Start_Time__c){
		            return true;
		        }
		    }
		    return false;
		}

		//when a key is pressed down, this is called
		function keyDown(e){
		    if([32, 38, 40].indexOf(e.keyCode) > -1) {//removes the ddefault functionality of the up, down, left, right, and spacebar keys
		        e.preventDefault();
		    }
		    var keynum;
		    if(window.event) { // IE
		      keynum = e.keyCode;
		    } else if(e.which){ // Netscape/Firefox/Opera
		      keynum = e.which;
		    }
		    keys[keynum] = true;
		    keyboardHandler();
		};
		//checks which keys have been released
		function keyUp(e){
		    var keynum;
		    if(window.event) { // IE
		      keynum = e.keyCode;
		    } else if(e.which){ // Netscape/Firefox/Opera
		      keynum = e.which;
		    }
		    keys[keynum] = false;
		};

		//warn the user if there are unsaved changes before leaving.
		//you can't actually change this method with newer versions of chrome, but the default one is perfectly fine as of 2016
		window.onbeforeunload = function(e){
		    events = $('#calendar').fullCalendar('clientEvents');
		    for(var i = 0; i < events.length; i++)
		        if(events[i].title.substring(0,unsavedTSIName.length) == unsavedTSIName)
		            return "board";//non null value so that chrome/FF displays the message
		    return null;//if it's null, chrome/FF will not display a message.
		}
