/**
 * @description       : 캘린더 뷰 컴포넌트
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';
import getEvents from '@salesforce/apex/CalendarAppController.getEvents';
import updateEventDates from '@salesforce/apex/CalendarAppController.updateEventDates';

export default class CalendarView extends LightningElement {
    fullCalendarInitialized = false;
    calendarApi;

    @api
    refetchEvents() {
        if (this.calendarApi) {
            this.calendarApi.refetchEvents();
        }
    }

    @api
    addEvent(eventData) {
        if (this.calendarApi) {
            this.calendarApi.addEvent(eventData);
        }
    }

    @api
    updateEvent(eventId, eventData) {
        if (this.calendarApi) {
            const existingEvent = this.calendarApi.getEventById(eventId);
            if (existingEvent) {
                existingEvent.setProp('title', eventData.title);
                existingEvent.setStart(eventData.start);
                existingEvent.setEnd(eventData.end);
            }
        }
    }

    @api
    removeEvent(eventId) {
        if (this.calendarApi) {
            const eventToRemove = this.calendarApi.getEventById(eventId);
            if (eventToRemove) {
                eventToRemove.remove();
            }
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
            return loadScript(this, FullCalendar + '/locales/ko.js');
        })
        .then(() => {
            this.initializeCalendar();
        })
        .catch(error => { 
            console.error('Error loading FullCalendar:', error); 
        });
    }

    initializeCalendar() {
        const calendarEl = this.template.querySelector('.calendar-container');
        if (!calendarEl) return;

        const calendar = new window.FullCalendar.Calendar(calendarEl, {
            headerToolbar: { 
                left: 'prev,next today', 
                center: 'title', 
                right: 'dayGridMonth,timeGridWeek,timeGridDay' 
            },
            locale: 'ko',
            initialView: 'dayGridMonth',
            editable: true,
            droppable: true,
            expandRows: true,
            height: 'auto',
            events: this.eventSource.bind(this),
            drop: this.handleDrop.bind(this),
            eventClick: this.handleEventClick.bind(this),
            eventDrop: this.handleEventDrop.bind(this),
            datesSet: this.handleDatesSet.bind(this)
        });
        
        this.calendarApi = calendar;
        calendar.render();
    }

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

    handleDrop(info) {
        info.jsEvent.preventDefault();
        this.dispatchEvent(new CustomEvent('eventdrop', { 
            detail: {
                draggedEl: info.draggedEl,
                date: info.date
            }
        }));
    }

    handleEventClick(info) {
        this.dispatchEvent(new CustomEvent('eventclick', { 
            detail: { eventId: info.event.id } 
        }));
    }

    // 드래그앤드롭으로 일정 이동 처리
    async handleEventDrop(info) {
        try {
            const eventId = info.event.id;
            const newStart = info.event.start.toISOString().slice(0, 16);
            const newEnd = info.event.end ? info.event.end.toISOString().slice(0, 16) : newStart;
            
            await updateEventDates({
                eventId: eventId,
                newStartDate: newStart,
                newEndDate: newEnd
            });
            
            this.dispatchEvent(new CustomEvent('eventmoved', {
                detail: {
                    eventId: eventId,
                    message: '일정이 성공적으로 이동되었습니다.'
                }
            }));
            
        } catch (error) {
            console.error('Error updating event dates:', error);
            this.dispatchEvent(new CustomEvent('eventerror', {
                detail: {
                    message: '일정 이동 중 오류가 발생했습니다.'
                }
            }));
            
            // 오류 발생 시 원래 위치로 되돌리기
            info.revert();
        }
    }

    handleDatesSet(dateInfo) {
        this.dispatchEvent(new CustomEvent('dateset', {
            detail: { 
                start: dateInfo.start.toISOString(),
                end: dateInfo.end.toISOString()
            }
        }));
    }
}