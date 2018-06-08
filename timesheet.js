$(function() {  //page ready

    $('#calendar').fullCalendar({ //initialize calendar

      schedulerLicenseKey: 'CC-Attribution-NonCommercial-NoDerivatives',

      header: {

        left: 'prev, next, today',

        center: 'title',

        right: 'month, agendaWeek, agendaDay'

      },

      minTime: "8:00",

      maxTime: "5:00",

      defaultView: 'timelineDay',

      views: {

        timelineFiveDays: {

          type: 'timeline',

          duration: { days: 5 }

        }

      },

      timeFormat: 'h:mm',

      dayClick: function(date, jsEvent, view) { //day click function

        alert('Clicked on: ' + date.format()); // first alert

        alert('Coordinates: ' + jsEvent.pageX + ',' + jsEvent.pageY); //second alert

        alert('Current view: ' + view.name); //third alert

          // (this).css('background-color', '#F37221'); //change background color on day clicked

      },

  })

});
