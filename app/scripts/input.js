/* global moment */
'use strict';

var Module = angular.module('datePicker');

Module.constant('dateTimeConfig', {
  template: function (attrs, id) {
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
        var format = dateTimeConfig.format,
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
        if (viewValue.length === format.length) {
          var m = moment(viewValue, format, true);
          if (m.isValid()) {
            return m.toDate();
          }
        } else if (viewValue.length === 0) {
          return null; // value has been cleared, it shouldn't null; not an empty string.
        }
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
