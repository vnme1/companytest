/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-17
 * @last modified by  : sejin.park@dkbmc.com
**/
/**
 *  * Project: Salesforce Development
 *  * Author: sejin.park@dkbmc.com
 *  * Description: JavaScript 기능 구현
 *  * License: Custom
 */

import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';
import getEvents from '@salesforce/apex/CalendarAppController.getEvents';

export default class CalendarView extends LightningElement {
    fullCalendarInitialized = false;
    calendarApi;

    // 부모 컴포넌트에서 이 함수를 호출하여 캘린더를 새로고침할 수 있습니다.
    @api
    refetchEvents() {
        this.calendarApi.refetchEvents();
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
        .catch(error => {
            console.error('Error loading FullCalendar:', error);
        });
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
            datesSet: (dateInfo) => {
            this.dispatchEvent(new CustomEvent('dateset', { detail: { start: dateInfo.start } }));
            }
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
        .catch(error => {
            console.error('Error fetching events:', error);
            failureCallback(error);
        });
    }

    // 이벤트가 드롭되었을 때, 부모에게 정보를 전달하는 이벤트 발생
    handleDrop(info) {
        info.jsEvent.preventDefault(); // 기본 동작 방지
        const eventDetails = {
            draggedEl: info.draggedEl,
            date: info.date
        };
        this.dispatchEvent(new CustomEvent('eventdrop', { detail: eventDetails }));
    }

    // 기존 이벤트를 클릭했을 때, 부모에게 ID를 전달하는 이벤트 발생
    handleEventClick(info) {
        this.dispatchEvent(new CustomEvent('eventclick', { detail: { eventId: info.event.id } }));
    }
}