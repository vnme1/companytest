/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-17
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';
import getEvents from '@salesforce/apex/CalendarAppController.getEvents';

export default class CalendarView extends LightningElement {
    fullCalendarInitialized = false;
    calendarApi;

    // 부모 컴포넌트에서 이 함수를 호출하여 캘린더를 새로고침합니다.
    @api
    refetchEvents() {
        if (this.calendarApi) {
            this.calendarApi.refetchEvents();
        }
    }

    renderedCallback() {
        if (this.fullCalendarInitialized) {
            return;
        }
        this.fullCalendarInitialized = true;

        Promise.all([
            loadStyle(this, FullCalendar + '/main.min.css'),
            loadScript(this, FullCalendar + '/main.min.js'),
        ])
        .then(() => {
            loadScript(this, FullCalendar + '/locales/ko.js').then(() => {
                this.initializeCalendar();
            });
        })
        .catch(error => { console.error('Error loading FullCalendar:', error); });
    }

    initializeCalendar() {
        const calendarEl = this.template.querySelector('.calendar-container');
        const calendar = new window.FullCalendar.Calendar(calendarEl, {
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
            locale: 'ko',
            initialView: 'dayGridMonth',
            editable: true,
            droppable: true,
            expandRows: true,
            events: this.eventSource.bind(this),
            drop: this.handleDrop.bind(this),
            eventClick: this.handleEventClick.bind(this),
            datesSet: this.handleDatesSet.bind(this) // 월 변경 시 이벤트 핸들러
        });
        this.calendarApi = calendar;
        calendar.render();
    }

    // Apex에서 이벤트를 가져오는 함수
    eventSource(fetchInfo, successCallback, failureCallback) {
        getEvents({
            startStr: fetchInfo.start.toISOString(),
            endStr: fetchInfo.end.toISOString()
        })
        .then(result => {
            const events = result.map(event => ({
                id: event.Id,
                title: event.Title__c,
                start: event.Start_DateTime__c,
                end: event.End_DateTime__c,
                allDay: false
            }));
            successCallback(events);
        })
        .catch(error => { failureCallback(error); });
    }

    // 항목이 드롭되었을 때, 부모에게 'eventdrop' 신호를 보냄
    handleDrop(info) {
        info.jsEvent.preventDefault();
        this.dispatchEvent(new CustomEvent('eventdrop', { 
            detail: {
                draggedEl: info.draggedEl,
                date: info.date
            }
        }));
    }

    // 기존 이벤트를 클릭했을 때, 부모에게 'eventclick' 신호를 보냄
    handleEventClick(info) {
        this.dispatchEvent(new CustomEvent('eventclick', { 
            detail: { eventId: info.event.id } 
        }));
    }

    // 달력의 월이 변경되었을 때, 부모에게 'dateset' 신호를 보냄
    handleDatesSet(dateInfo) {
        this.dispatchEvent(new CustomEvent('dateset', {
            detail: { start: dateInfo.start }
        }));
    }
}