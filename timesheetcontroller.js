global with sharing class TimesheetInterfaceController {
    public Timesheet__c timesheet {get;set;}
    public Timesheet_Item__c timesheetItem {get; set;}
    public string searchString{get;set;}

    public TimesheetInterfaceController(){
        timesheetItem = new Timesheet_Item__c();
        //timesheet = new Timesheet__c();
        // get the current search string
        //searchString = System.currentPageReference().getParameters().get('lksrch');
        //runSearch();
    }

    //takes in info about query, passes back 2D list of values
    //data[0][0] = the datatype we want to get, data[1][0] is the datatype we want to compare to
    //
    //+-----------------+-----------+------------------------+--------
    //|    ID/NAME      |  NAME/ID  |   Capital_Project__c   | ...
    //+-----------------+-----------+------------------------+--------
    //|timesheet item id|           |        123456          | ...
    //+-----------------+-----------+------------------------+--------
    @RemoteAction
    public static List<List<String> > getObjects(String JSONString){
        List<List<String> > data = (List<List<String>>) JSON.deserialize(JSONString, List<List<String>>.class);
        List<List<String> > sobjs = new List<List<String> >();
        System.Debug(LoggingLevel.INFO, 'data: ' + JSONString);
        for(Integer i = 2; i < data.size(); i++){
            if(data[i][1] != ''){
                String query = 'SELECT ' + data[0][0] + ' FROM ' + data[i][0] + ' WHERE ' + data[1][0] + ' = \'' + data[i][1] + '\'';
                System.debug(LoggingLevel.INFO, query);
                List<sObject> qry = Database.query(query);
                if(qry != null && qry.size() > 0){
                    sobjs.add(new List<String> {data[i][0], String.valueOf(qry[0].get(data[0][0])) });
                }else{
                    System.debug(LoggingLevel.INFO, 'did not find object of ' + data[1][0] + ' = ' + data[0][0] );
                }
            }
        }
        sobjs.add(new List<String> {data[0][1]});
        return sobjs;
    }
    //retrieves the specified timesheet
    @RemoteAction
    public static Timesheet__c getTimesheet(List<String> data){//data[0] = the date, data[1] = the userID
        Date weekDate = Date.parse(data[0]);
        Date startOfWeek = weekDate.toStartOfWeek();
        List<Timesheet__c> timesheetData = [SELECT id, Name, IsDeleted,  Employee__c, Week_Of__c, Notes__c, Manager__c, Override_Manager__c, International_Employee_Calc__c, Qualifies_for_DT_Calc__c, Locked__c, Adjust_Timesheets__c, Test_Bypass__c FROM Timesheet__c WHERE Employee__c =: data[1] AND Week_Of__c =: startOfWeek];
        if(timesheetData.size() > 0)
            return timesheetData[0];
        return null;
    }
    //retrieves the specified timesheet items
    @RemoteAction
    public static List<Timesheet_Item__c> getTimesheetItems(List<String> data){//data[0] = date; data[1] = userID
        Date weekDate = Date.parse(data[0]);
        Date startOfWeek = weekDate.toStartOfWeek();
        List<Timesheet_Item__c> items = [SELECT (SELECT Id, Name, Date__c, Start_Time__c, End_Time__c, Type__c, Earnings_Code__c, Capital_Project__c, Capital_Subproject__c, Service_Order__c, Internal_Service_Order__c, Case__c, Service__c, Opportunity__c, Account__c, Real_Estate_Project__c FROM Timesheet_Items__r) FROM Timesheet__c WHERE Employee__c =: data[1] AND Week_Of__c =: startOfWeek][0].Timesheet_Items__r;
        return items;
    }
    //parses the JSON string into a timesheet and uploads it
    @RemoteAction
    public static String pushTimesheet(String jsonString){
        System.debug(Logginglevel.INFO,'PUSH TIMESHEET: ' + jsonString);
        List<Timesheet__c> serialized = (List<Timesheet__c>)JSON.deserialize(jsonString, List<Timesheet__c>.class);
        try {
            upsert serialized;
        } catch (DmlException e) {
            return e.getMessage();
        }
        return 'Timesheet successfully uploaded';
    }
    //parses the JSON sstring into a list of timesheet items and uploads it
    @RemoteAction
    public static String pushTimesheetItems(String jsonString){
        System.debug(Logginglevel.INFO,'PUSH TIMESHEET ITEMS: ' + jsonString);
        List<Timesheet_Item__c> data = (List<Timesheet_Item__c>)JSON.deserialize(jsonString, List<Timesheet_Item__c>.class );
        try {
            upsert data;
        } catch (DmlException e) {
            return e.getMessage();
        }
        return 'Timesheet Items succecssfully uploaded';
    }
    //parses the list of timesheet items into a JSON string and deletes them.
    @RemoteAction
    public static String deleteTimesheetItems(String jsonString){
        System.debug(Logginglevel.INFO, 'DELETE TIMESHEET ITEMS: ' + jsonString);
        List<Timesheet_Item__c> data = (List<Timesheet_Item__c>)JSON.deserialize(jsonString, List<Timesheet_Item__c>.class );
        try {
            delete data;
        }catch(DmlException e){
            return e.getMessage();
        }
        return 'Timesheet Items successfully deleted';
    }
}
