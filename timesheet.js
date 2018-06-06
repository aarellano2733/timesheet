$(function() {

  $('#calendar').fullCalendar({
    'render'
    header: { center: 'month,agendaWeek' }, // buttons for switching between views

    views: {
    month: { // name of view
    titleFormat: 'YYYY, MM, DD'

    dayClick: function() {

    alert('a day has been clicked!');

  })

});
