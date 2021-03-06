'use strict';
(function(angular){
/* global moment */
var Module = angular.module('datePicker', []);

Module.constant('datePickerConfig', {
  template: 'templates/datepicker.html',
  view: 'date',
  views: ['year', 'month', 'date', 'hours', 'minutes'],
  momentNames: {
    year: 'year',
    month: 'month',
    date: 'day',
    hours: 'hours',
    minutes: 'minutes',
  },
  compareFunctions: {
    date: 'isSameDay',
    year: 'isSameYear',
    month: 'isSameMonth',
    hours: 'isSameHour',
    minutes: 'isSameMinutes'
  },
  titleFormats: {
    month: 'YYYY',
    date: 'YYYY MMMM',
    hours: 'LL',
    minutes: 'LL',
  },
  itemFormats: {
    date: 'DD',
    year: 'YYYY',
    month: 'MMM',
    hours: 'HH:mm',
    minutes: 'HH:mm'
  },
  step: 5
});

//Moment format filter.
Module.filter('mFormat', ['datePickerUtils', function (datePickerUtils) {
  return function (m, format, tz) {
    return datePickerUtils.formatDate(m, format, tz);
  };
}]);

Module.directive('datePicker', ['datePickerConfig', 'datePickerUtils', function datePickerDirective(datePickerConfig, datePickerUtils) {

  //noinspection JSUnusedLocalSymbols
  return {
    require: '?ngModel',
    template: '<div ng-include="template"></div>',
    scope: {
      model: '=datePicker',
      after: '=?',
      before: '=?'
    },
    link: function (scope, element, attrs, ngModel) {
      function prepareViews() {
        scope.views = datePickerConfig.views.concat();
        scope.view = attrs.view || datePickerConfig.view;

        scope.views = scope.views.slice(
          scope.views.indexOf(attrs.maxView || 'year'),
          scope.views.indexOf(attrs.minView || 'minutes') + 1
        );

        if (scope.views.length === 1 || scope.views.indexOf(scope.view) === -1) {
          scope.view = scope.views[0];
        }
      }

      function getDate(name) {
        return datePickerUtils.getDate(scope, attrs, name);
      }

      var tz = scope.tz = attrs.timezone,
        createMoment = datePickerUtils.createMoment,
        eventIsForPicker = datePickerUtils.eventIsForPicker,
        step = parseInt(attrs.step || datePickerConfig.step, 10),
        minDate = getDate('minDate'),
        maxDate = getDate('maxDate'),
        pickerID = element[0].id,
        now = scope.now = createMoment(),
        selected = null,
        firstDay = attrs.firstDay && attrs.firstDay >= 0 && attrs.firstDay <= 6 ? parseInt(attrs.firstDay, 10) : null,
        disableDirectChange = false;

      if (!firstDay) {
        // Get first day from moment
        firstDay = moment.localeData().firstDayOfWeek();
      }

      if (ngModel) {
        scope.date = createMoment(ngModel.$modelValue);
      } else if (scope.model) {
        scope.date = createMoment(scope.model);
      }

      if (scope.date) {
        selected = scope.date.clone();
      } else {
        scope.date = now.clone();
      }

      datePickerUtils.setParams(tz, firstDay);

      scope.template = attrs.template || datePickerConfig.template;

      scope.watchDirectChanges = attrs.watchDirectChanges !== undefined;
      scope.callbackOnSetDate = attrs.dateChange ? datePickerUtils.findFunction(scope, attrs.dateChange) : undefined;
      scope.close = attrs.close ? datePickerUtils.findFunction(scope, attrs.close) : undefined;

      prepareViews();

      scope.goToNow = function () {
        var date = createMoment();
        scope.date = date;
        update();
      };

      scope.changeView = function () {
        var nextViewIndex = scope.views.indexOf(scope.view) - 1;
        if (nextViewIndex < 0) {
          return;
        }
        scope.view = scope.views[nextViewIndex];
      };

      scope.setView = function (nextView) {
        if (scope.views.indexOf(nextView) !== -1) {
          scope.view = nextView;
        }
      };

      scope.selectDate = function (date) {
        if (attrs.disabled || !date.selectable) {
          return false;
        }
        if (isSame(scope.date, date)) {
          date = scope.date;
        }

        date = clipDate(date);
        if (!date) {
          return false;
        }
        disableDirectChange = true;
        scope.date = date;

        var nextView = scope.views[scope.views.indexOf(scope.view) + 1];

        if (!nextView) {
          setDate();
        }

        if (nextView) {
          scope.setView(nextView);
        } else {
          prepareViewData();
        }
      };

      function setDate() {
        selected = scope.date.clone();
        if (ngModel) {
          ngModel.$modelValue = scope.date.toDate();
        }

        scope.$emit('setDate', scope.date.toDate(), scope.view);

        //This is duplicated in the new functionality.
        if (scope.callbackOnSetDate) {
          scope.callbackOnSetDate(attrs.datePicker, scope.date.toDate());
        }
      }

      function update() {
        var view = scope.view;
        datePickerUtils.setParams(tz, firstDay);

        var refDate = scope.date;

        // Default the picker menu to the current date when passed an invalid date (e.g. 'year' view of 2010-2020 is more user friendly than 1899-1899).
        if ( !datePickerUtils.isValidDate(refDate)) {
          refDate = createMoment();
        }

        var items;
        switch (view) {
          case 'year':
            items = datePickerUtils.getVisibleYears(refDate);
            break;
          case 'month':
            items = datePickerUtils.getVisibleMonths(refDate);
            break;
          case 'date':
            scope.weekdays = scope.weekdays || datePickerUtils.getDaysOfWeek();
            items = datePickerUtils.getVisibleDays(refDate);
            break;
          case 'hours':
            items = datePickerUtils.getVisibleHours(refDate);
            break;
          case 'minutes':
            items = datePickerUtils.getVisibleMinutes(refDate, step);
            break;
        }

        prepareViewData(items);
      }

      function watch() {
        if (scope.view !== 'date') {
          return scope.view;
        }
        return scope.date ? scope.date.month() : null;
      }

      scope.$watch(watch, update);

      if (scope.watchDirectChanges) {
        scope.$watch('model', function () {
          if (disableDirectChange) {
            disableDirectChange = false;
            return;
          }

          var newDate = createMoment(scope.model);

          if (selected && selected.isSame(newDate)) {
            return;
          }

          scope.date = newDate;
          selected = newDate.clone();

          update();
        });
      }

      function prepareViewData(aItems) {
        var view = scope.view,
          date = scope.date,
          format = datePickerConfig.itemFormats[view],
          compareFunc = datePickerConfig.compareFunctions[view],
          classes = [],
          items = [],
          item;

        if (!aItems) {
          aItems = scope.items;
        }

        datePickerUtils.setParams(tz, firstDay);
        if (view === 'year') {
          scope.title = aItems[0].year() + ' - ' + aItems[aItems.length - 1].year();
        } else {
          scope.title = datePickerUtils.formatDate(date, datePickerConfig.titleFormats[view], tz);
        }

        for (var i = 0; i < aItems.length; i++) {
          var curItem = aItems[i];
          var selectable = true;
          classes = [];
          if (selected && datePickerUtils[compareFunc](selected, aItems[i])) {
            classes.push('active');
          }
          if (isNow(aItems[i], view)) {
            classes.push('now');
          }
          if (view === 'date' && aItems[i].month() !== date.month()) {
            classes.push('disabled');
          }
          if (!inValidRange(aItems[i])) {
            classes.push('invalid');
            selectable = false;
          }

          item = curItem.clone();
          item.title = datePickerUtils.formatDate(curItem, format);
          item.classes = classes.join(' ');
          item.selectable = selectable;
          items.push(item);
        }

        scope.items = items;
      }

      scope.next = function (delta) {
        var date = moment(scope.date);
        delta = delta || ((scope.view === 'year') ? 10 : 1);
        switch (scope.view) {
          case 'year':
            /*falls through*/
          case 'month':
            date.year(date.year() + delta);
            break;
          case 'date':
            date.month(date.month() + delta);
            break;
          case 'hours':
            date.date(date.date() + delta);
            break;
          case 'minutes':
            date.hours(date.hours() + delta);
            break;
        }
        date = clipDate(date);
        if (date) {
          scope.date = date;
          update();
        }
      };

      function inValidRange(date) {
        var valid = true;
        if (minDate && minDate.isAfter(date)) {
          valid = isSame(minDate, date);
        }
        if (maxDate && maxDate.isBefore(date)) {
          valid &= isSame(maxDate, date);
        }
        return valid;
      }

      function isSame(date1, date2) {
        return date1.isSame(date2, datePickerConfig.momentNames[scope.view]) ? true : false;
      }

      function clipDate(date) {
        if (minDate && minDate.isAfter(date)) {
          return minDate;
        } else if (maxDate && maxDate.isBefore(date)) {
          return maxDate;
        } else {
          return date;
        }
      }

      function isNow(date, view) {
        var is = true;

        switch (view) {
          case 'minutes':
            is &= ~~(now.minutes() / step) === ~~(date.minutes() / step);
            /* falls through */
          case 'hours':
            is &= now.hours() === date.hours();
            /* falls through */
          case 'date':
            is &= now.date() === date.date();
            /* falls through */
          case 'month':
            is &= now.month() === date.month();
            /* falls through */
          case 'year':
            is &= now.year() === date.year();
        }
        return is;
      }

      scope.prev = function (delta) {
        return scope.next(-delta || ((scope.view === 'year') ? -10 : -1));
      };

      if (pickerID) {
        scope.$on('pickerUpdate', function (event, pickerIDs, data) {
          if (eventIsForPicker(pickerIDs, pickerID)) {
            var updateViews = false,
                updateViewData = false;

            if (angular.isDefined(data.minDate)) {
              minDate = data.minDate ? data.minDate : false;
              updateViewData = true;
            }
            if (angular.isDefined(data.maxDate)) {
              maxDate = data.maxDate ? data.maxDate : false;
              updateViewData = true;
            }

            if (angular.isDefined(data.minView)) {
              attrs.minView = data.minView;
              updateViews = true;
            }
            if (angular.isDefined(data.maxView)) {
              attrs.maxView = data.maxView;
              updateViews = true;
            }
            attrs.view = data.view || attrs.view;

            if (updateViews) {
              prepareViews();
            }

            if (updateViewData) {
              update();
            }
          }
        });
      }
    }
  };
}]);
/* global moment */

angular.module('datePicker').factory('datePickerUtils', function () {
var tz, firstDay;
  var createNewDate = function (year, month, day, hour, minute) {
    var utc = Date.UTC(year | 0, month | 0, day | 0, hour | 0, minute | 0);
    return tz ? moment.tz(utc, tz) : moment(utc);
  };

  return {
    getVisibleMinutes: function (m, step) {
      var year = m.year(),
        month = m.month(),
        day = m.date(),
        hour = m.hours(), pushedDate,
        offset = m.utcOffset() / 60,
        minutes = [], minute;

      for (minute = 0 ; minute < 60 ; minute += step) {
        pushedDate = createNewDate(year, month, day, hour - offset, minute);
        minutes.push(pushedDate);
      }
      return minutes;
    },
    getVisibleDays: function (m) {
      m = moment(m);
      var startYear = m.year(),
          startMonth = m.month();

      //Set date to the first day of the month
      m.date(1);

      //Grab day of the week
      var day = m.day();

      //Go back the required number of days to arrive at the previous week start
      m.date(firstDay - (day + (firstDay >= day ? 6 : -1)));

      var days = [];
      for (var i = 0; i < 6; i++) {
        if ((m.year()*100 + m.month()) > (startYear*100 + startMonth)) {
          break;
        }
        Array.prototype.push.apply(days, this.getDaysOfWeek(m));
        m.add(7, 'd');
      }
      return days;
    },
    getVisibleYears: function (d) {
      var m = moment(d),
        year = m.year();

      m.year(year - (year % 10));
      year = m.year();

      var offset = m.utcOffset() / 60,
        years = [],
        pushedDate,
        actualOffset;

      for (var i = 0; i < 12; i++) {
        pushedDate = createNewDate(year, 0, 1, 0 - offset);
        actualOffset = pushedDate.utcOffset() / 60;
        if (actualOffset !== offset) {
          pushedDate = createNewDate(year, 0, 1, 0 - actualOffset);
          offset = actualOffset;
        }
        years.push(pushedDate);
        year++;
      }
      return years;
    },
    getDaysOfWeek: function (m) {
      m = m ? m : (tz ? moment.tz(tz).day(firstDay) : moment().day(firstDay));

      var year = m.year(),
        month = m.month(),
        day = m.date(),
        days = [],
        pushedDate,
        offset = m.utcOffset() / 60,
        actualOffset;

      for (var i = 0; i < 7; i++) {
        pushedDate = createNewDate(year, month, day, 0 - offset, 0, false);
        actualOffset = pushedDate.utcOffset() / 60;
        if (actualOffset !== offset) {
          pushedDate = createNewDate(year, month, day, 0 - actualOffset, 0, false);
        }
        days.push(pushedDate);
        day++;
      }
      return days;
    },
    getVisibleMonths: function (m) {
      var year = m.year(),
        offset = m.utcOffset() / 60,
        months = [],
        pushedDate,
        actualOffset;

      for (var month = 0; month < 12; month++) {
        pushedDate = createNewDate(year, month, 1, 0 - offset, 0, false);
        actualOffset = pushedDate.utcOffset() / 60;
        if (actualOffset !== offset) {
          pushedDate = createNewDate(year, month, 1, 0 - actualOffset, 0, false);
        }
        months.push(pushedDate);
      }
      return months;
    },
    getVisibleHours: function (m) {
      var year = m.year(),
        month = m.month(),
        day = m.date(),
        hours = [],
        hour, pushedDate, actualOffset,
        offset = m.utcOffset() / 60;

      for (hour = 0 ; hour < 24 ; hour++) {
        pushedDate = createNewDate(year, month, day, hour - offset, 0, false);
        actualOffset = pushedDate.utcOffset() / 60;
        if (actualOffset !== offset) {
          pushedDate = createNewDate(year, month, day, hour - actualOffset, 0, false);
        }
        hours.push(pushedDate);
      }

      return hours;
    },
    isAfter: function (model, date) {
      return model && model.unix() >= date.unix();
    },
    isBefore: function (model, date) {
      return model.unix() <= date.unix();
    },
    isSameYear: function (model, date) {
      return model && model.year() === date.year();
    },
    isSameMonth: function (model, date) {
      return this.isSameYear(model, date) && model.month() === date.month();
    },
    isSameDay: function (model, date) {
      return this.isSameMonth(model, date) && model.date() === date.date();
    },
    isSameHour: function (model, date) {
      return this.isSameDay(model, date) && model.hours() === date.hours();
    },
    isSameMinutes: function (model, date) {
      return this.isSameHour(model, date) && model.minutes() === date.minutes();
    },
    setParams: function (zone, fd) {
      tz = zone;
      firstDay = fd;
    },
    scopeSearch: function (scope, name, comparisonFn) {
      var parentScope = scope,
          nameArray = name.split('.'),
          target, i, j = nameArray.length;

      do {
        target = parentScope = parentScope.$parent;

        //Loop through provided names.
        for (i = 0; i < j; i++) {
          target = target[nameArray[i]];
          if (!target) {
            continue;
          }
        }

        //If we reached the end of the list for this scope,
        //and something was found, trigger the comparison
        //function. If the comparison function is happy, return
        //found result. Otherwise, continue to the next parent scope
        if (target && comparisonFn(target)) {
          return target;
        }

      } while (parentScope.$parent);

      return false;
    },
    findFunction: function (scope, name) {
      //Search scope ancestors for a matching function.
      return this.scopeSearch(scope, name, function(target) {
        //Property must also be a function
        return angular.isFunction(target);
      });
    },
    findParam: function (scope, name) {
      //Search scope ancestors for a matching parameter.
      return this.scopeSearch(scope, name, function() {
        //As long as the property exists, we're good
        return true;
      });
    },
    createMoment: function (m) {
      if (tz) {
        return moment.tz(m, tz);
      } else {
        //If input is a moment, and we have no TZ info, we need to remove TZ
        //info from the moment, otherwise the newly created moment will take
        //the timezone of the input moment. The easiest way to do that is to
        //take the unix timestamp, and use that to create a new moment.
        //The new moment will use the local timezone of the user machine.
        return moment.isMoment(m) ? moment.unix(m.unix()) : moment(m);
      }
    },
    getDate: function (scope, attrs, name) {
      var result = false;
      if (attrs[name]) {
        result = this.createMoment(attrs[name]);
        if (!result.isValid()) {
          result = this.findParam(scope, attrs[name]);
          if (result) {
            result = this.createMoment(result);
          }
        }
      }

      return result;
    },
    eventIsForPicker: function (targetIDs, pickerID) {
      //Checks if an event targeted at a specific picker, via either a string name, or an array of strings.
      return (angular.isArray(targetIDs) && targetIDs.indexOf(pickerID) > -1 || targetIDs === pickerID);
    },
    isValidDate : function(value) {
      // Invalid Date: getTime() returns NaN
      return value && !(value.getTime && value.getTime() !== value.getTime());
    },
    formatDate: function (aDate, aFormat, aTz) {
      if (!(moment.isMoment(aDate))) {
        return moment(aDate).format(aFormat);
      }
      return aTz ? moment.tz(aDate, aTz).format(aFormat) : aDate.format(aFormat);
    }
  };
});
/* global moment */
var Module = angular.module('datePicker');

Module.directive('dateRange', ['$compile', 'datePickerUtils', 'dateTimeConfig', function ($compile, datePickerUtils, dateTimeConfig) {
  function getTemplate(attrs, id, model, min, max) {
    return dateTimeConfig.template(angular.extend(attrs, {
      ngModel: model,
      minDate: min && moment.isMoment(min) ? min.format() : false,
      maxDate: max && moment.isMoment(max) ? max.format() : false
    }), id);
  }

  function randomName() {
    return 'picker' + Math.random().toString().substr(2);
  }

  return {
    scope: {
      start: '=',
      end: '='
    },
    link: function (scope, element, attrs) {
      var dateChange = null,
          pickerRangeID = element[0].id,
          pickerIDs = [randomName(), randomName()],
          createMoment = datePickerUtils.createMoment,
          eventIsForPicker = datePickerUtils.eventIsForPicker;

      scope.dateChange = function (modelName, newDate) {
        //Notify user if callback exists.
        if (dateChange) {
          dateChange(modelName, newDate);
        }
      };

      function setMax(date) {
        scope.$broadcast('pickerUpdate', pickerIDs[0], {
          maxDate: date
        });
      }

      function setMin(date) {
        scope.$broadcast('pickerUpdate', pickerIDs[1], {
          minDate: date
        });
      }

      if (pickerRangeID) {
        scope.$on('pickerUpdate', function (event, targetIDs, data) {
          if (eventIsForPicker(targetIDs, pickerRangeID)) {
            //If we received an update event, dispatch it to the inner pickers using their IDs.
            scope.$broadcast('pickerUpdate', pickerIDs, data);
          }
        });
      }

      datePickerUtils.setParams(attrs.timezone);

      scope.start = createMoment(scope.start);
      scope.end = createMoment(scope.end);

      scope.$watchGroup(['start', 'end'], function (dates) {
        //Scope data changed, update picker min/max
        setMin(dates[0]);
        setMax(dates[1]);
      });

      if (angular.isDefined(attrs.dateChange)) {
        dateChange = datePickerUtils.findFunction(scope, attrs.dateChange);
      }

      attrs.onSetDate = 'dateChange';

      var template = '<div><table class="date-range"><tr><td valign="top">' +
                    getTemplate(attrs, pickerIDs[0], 'start', false, scope.end) +
                    '</td><td valign="top">' +
                    getTemplate(attrs, pickerIDs[1], 'end', scope.start, false) +
                  '</td></tr></table></div>';

      var picker = $compile(template)(scope);
      element.append(picker);
    }
  };
}]);
/* global moment */
var Module = angular.module('datePicker');

Module.constant('dateTimeConfig', {
  template: function (attrs) {
    return '' +
        '<div ' +
        'date-picker="' + attrs.ngModel + '" ' +
        'close="closePicker" ' +
        (attrs.view ? 'view="' + attrs.view + '" ' : '') +
        (attrs.maxView ? 'max-view="' + attrs.maxView + '" ' : '') +
        (attrs.maxDate ? 'max-date="' + attrs.maxDate + '" ' : '') +
        (attrs.template ? 'template="' + attrs.template + '" ' : '') +
        (attrs.minView ? 'min-view="' + attrs.minView + '" ' : '') +
        (attrs.minDate ? 'min-date="' + attrs.minDate + '" ' : '') +
        (attrs.step ? 'step="' + attrs.step + '" ' : '') +
        (attrs.onSetDate ? 'date-change="' + attrs.onSetDate + '" ' : '') +
        (attrs.watchDirectChanges !== undefined ? 'watch-direct-changes ' : '') +
        (attrs.firstDay ? 'first-day="' + attrs.firstDay + '" ' : '') +
        (attrs.timezone ? 'timezone="' + attrs.timezone + '" ' : '') +
        '></div>';
  },
  format: 'YYYY-MM-DD HH:mm',
  autoClose: true,
  position: 'relative'
});

Module.directive('dateTimeAppend', function () {
  return {
    link: function (scope, element) {
      element.bind('click', function () {
        element.find('input')[0].focus();
      });
    }
  };
});

Module.directive('dateTime', [
  '$compile',
  '$document',
  '$filter',
  'dateTimeConfig',
  '$parse',
  'datePickerUtils',
  function ($compile, $document, $filter, dateTimeConfig, $parse, datePickerUtils) {
    var body = $document.find('body');
    var dateFilter = $filter('mFormat');

    return {
      require: 'ngModel',
      scope: true,
      link: function (scope, element, attrs, ngModel) {
        var format = attrs.format || dateTimeConfig.format,
          autoClose = attrs.autoClose ? $parse(attrs.autoClose)(scope) : dateTimeConfig.autoClose,
          picker = null,
          pickerID = element[0].id,
          position = attrs.position || dateTimeConfig.position,
          container = null,
          minDate = null,
          minValid = null,
          maxDate = null,
          maxValid = null,
          timezone = attrs.timezone || false,
          eventIsForPicker = datePickerUtils.eventIsForPicker,
          dateChange = null,
          shownOnce = false,
          template;


      scope.$watch($parse(attrs.format), function (newValue) {
        if (newValue) {
          format = newValue;
          ngModel.$setViewValue(formatter(ngModel.$modelValue));
          ngModel.$render();
        }
      });

      function formatter(value) {
        return dateFilter(value, format, timezone);
      }

      function parser(viewValue) {
        var m = moment(viewValue, format, true);
        if (m.isValid()) {
          return m.toDate();
        }
        //if (viewValue.length === 0) {
        //  return null; // value has been cleared, it shouldn't null; not an empty string.
        //}
        return undefined;
      }

      function setMin(date) {
        minDate = date;
        attrs.minDate = date ? date.format() : date;
        minValid = moment.isMoment(date);
      }

      function setMax(date) {
        maxDate = date;
        attrs.maxDate = date ? date.format() : date;
        maxValid = moment.isMoment(date);
      }

      ngModel.$formatters.push(formatter);
      ngModel.$parsers.unshift(parser);

      if (angular.isDefined(attrs.minDate)) {
        setMin(datePickerUtils.findParam(scope, attrs.minDate));

        ngModel.$validators.min = function (value) {
          //If we don't have a min / max value, then any value is valid.
          return minValid ? moment.isMoment(value) && (minDate.isSame(value) || minDate.isBefore(value)) : true;
        };
      }

      if (angular.isDefined(attrs.maxDate)) {
        setMax(datePickerUtils.findParam(scope, attrs.maxDate));

        ngModel.$validators.max = function (value) {
          return maxValid ? moment.isMoment(value) && (maxDate.isSame(value) || maxDate.isAfter(value)) : true;
        };
      }

      if (angular.isDefined(attrs.dateChange)) {
        dateChange = datePickerUtils.findFunction(scope, attrs.dateChange);
      }

      function getTemplate() {
        template = dateTimeConfig.template(attrs);
      }


      function updateInput(event, value) {
        event.stopPropagation();
        ngModel.$setViewValue(formatter(value));
        ngModel.$render();
      }

      function clear() {
        if (picker) {
          picker.remove();
          picker = null;
        }
        if (container) {
          container.remove();
          container = null;
        }
      }

      scope.closePicker = clear;

      if (pickerID) {
        scope.$on('pickerUpdate', function (event, pickerIDs, data) {
          if (eventIsForPicker(pickerIDs, pickerID)) {
            if (picker) {
              //Need to handle situation where the data changed but the picker is currently open.
              //To handle this, we can create the inner picker with a random ID, then forward
              //any events received to it.
            } else {
              var validateRequired = false;
              if (angular.isDefined(data.minDate)) {
                setMin(data.minDate);
                validateRequired = true;
              }
              if (angular.isDefined(data.maxDate)) {
                setMax(data.maxDate);
                validateRequired = true;
              }

              if (angular.isDefined(data.minView)) {
                attrs.minView = data.minView;
              }
              if (angular.isDefined(data.maxView)) {
                attrs.maxView = data.maxView;
              }
              attrs.view = data.view || attrs.view;

              if (validateRequired) {
                ngModel.$validate();
              }
              if (angular.isDefined(data.format)) {
                format = attrs.format = data.format || dateTimeConfig.format;
                ngModel.$modelValue = -1; //Triggers formatters. This value will be discarded.
              }
              getTemplate();
            }
          }
        });
      }

      function showPicker() {
        if (picker) {
          return;
        }
        // create picker element
        picker = $compile(template)(scope);
        scope.$digest();

        //If the picker has already been shown before then we shouldn't be binding to events, as these events are already bound to in this scope.
        if (!shownOnce) {
          scope.$on('setDate', function (event, date) {
            updateInput(event, date);
            if (dateChange) {
              dateChange(attrs.ngModel, date);
            }
            if (autoClose) {
              clear();
            }
          });

          scope.$on('$destroy', clear);
          shownOnce = true;
        }

        // move picker below input element
        if (position === 'absolute') {
          var pos = element[0].getBoundingClientRect();
          // Support IE8
          var height = pos.height || element[0].offsetHeight;
          picker.css({ top: (pos.top + height) + 'px', left: pos.left + 'px', display: 'block', position: position });
          body.append(picker);
        } else {
          // relative
          container = angular.element('<div class="data-time-picker-popup top left"></div>');
          element[0].parentElement.insertBefore(container[0], element[0]);
          container.append(picker);
          container.css({ top: element[0].offsetHeight + 'px'});
        }
        picker.bind('mousedown', function (evt) {
          evt.preventDefault();
        });
      }

      element.bind('click', showPicker);
      element.bind('focus', showPicker);
      element.bind('blur', clear);
      getTemplate();
    }
  };
}]);

angular.module('datePicker').run(['$templateCache', function($templateCache) {
$templateCache.put('templates/datepicker.html',
    "<div class=\"date-time-picker\">\n" +
    "  <div class=\"header\">\n" +
    "    <div ng-click=\"prev()\"><i class=\"icon double prev\"></i></div>\n" +
    "    <div ng-click=\"goToNow()\"><i class=\"icon today\"></i></div>\n" +
    "    <div ng-click=\"next()\"><i class=\"icon double next\"></i></div>\n" +
    "    <div class=\"title\" ng-click=\"changeView()\" ng-bind=\"title\"></div>\n" +
    "    <div ng-if=\"close\" ng-click=\"close()\"><i class=\"icon close\"></i></div>\n" +
    "  </div>\n" +
    "  <div class=\"items weekdays\" ng-if=\"view=='date'\">\n" +
    "    <div ng-class=\"{weekend: !(day.day() % 6)}\" ng-repeat=\"day in weekdays\" ng-bind=\"day|mFormat:'ddd':tz\"></div>\n" +
    "  </div>\n" +
    "  <div class=\"items\" ng-class=\"view\">\n" +
    "    <div ng-repeat=\"date in items\"\n" +
    "      ng-class=\"date.classes\"\n" +
    "      ng-click=\"selectDate(date)\"\n" +
    "      ng-bind=\"date.title\">\n" +
    "    </div>\n" +
    "  </div>\n" +
    "</div>\n" +
    "\n"
  );

}]);
})(angular);