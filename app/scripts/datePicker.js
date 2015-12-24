/* global moment */
'use strict';

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