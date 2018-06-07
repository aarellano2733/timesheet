$(function() {  //page ready

    $('#calendar').fullCalendar({ //initialize calendar

      dayClick: function() {

        alert('a day has been clicked!')
      }
  })

});
