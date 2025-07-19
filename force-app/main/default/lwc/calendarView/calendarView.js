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

function toYMD(date) {
    try {
        const offsetMs = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - offsetMs);
        return localDate.toISOString().slice(0, 10);
    } catch (e) {
        return '';
    }
}

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
            const existingEvent = this.calendarApi.getEventById(eventData.id);
            if (!existingEvent) {
                this.calendarApi.addEvent(eventData);
            }
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
        setTimeout(() => {
            this.loadFullCalendar();
        }, 100);
    }

    async loadFullCalendar() {
        if (this.fullCalendarInitialized) {
            return;
        }

        try {
            await Promise.all([
                loadStyle(this, FullCalendar + '/main.min.css'),
                loadScript(this, FullCalendar + '/main.min.js'),
            ]);
            await loadScript(this, FullCalendar + '/locales/ko.js');
            this.fullCalendarInitialized = true;
            this.initializeCalendar();
        } catch (error) {
            this.fullCalendarInitialized = false;
        }
    }

    initializeCalendar() {
        const calendarEl = this.template.querySelector('.calendar-container');
        if (!calendarEl || !window.FullCalendar) {
            return;
        }

        try {
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
                height: 800,
                contentHeight: 700,
                events: this.eventSource.bind(this),
                drop: this.handleDrop.bind(this),
                eventClick: this.handleEventClick.bind(this),
                eventDrop: this.handleEventDrop.bind(this),
                eventReceive: this.handleEventReceive.bind(this),
                datesSet: this.handleDatesSet.bind(this)
            });

            this.calendarApi = calendar;
            calendar.render();
        } catch (error) {
            // silent
        }
    }

    eventSource(fetchInfo, successCallback, failureCallback) {
        getEvents({
            startStr: toYMD(fetchInfo.start),
            endStr: toYMD(fetchInfo.end)
        })
        .then(result => {
            const events = result.map(event => {
                const startDate = event.Start_Date__c;
                const endDate = new Date(event.End_Date__c);
                endDate.setDate(endDate.getDate() + 1);

                return {
                    id: event.Id,
                    title: event.Title__c,
                    start: startDate,
                    end: endDate.toISOString().slice(0, 10),
                    allDay: false
                };
            });
            successCallback(events);
        })
        .catch(error => {
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

    handleEventReceive(info) {
        info.event.remove();
    }

    handleEventClick(info) {
        this.dispatchEvent(new CustomEvent('eventclick', {
            detail: { eventId: info.event.id }
        }));
    }

    async handleEventDrop(info) {
        try {
            const eventId = info.event.id;
            const newStart = toYMD(info.event.start);

            let newEnd = newStart;
            if (info.event.end) {
                const adjustedEnd = new Date(info.event.end);
                adjustedEnd.setDate(adjustedEnd.getDate() - 1);
                newEnd = toYMD(adjustedEnd);
            }

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
            this.dispatchEvent(new CustomEvent('eventerror', {
                detail: {
                    message: '일정 이동 중 오류가 발생했습니다.'
                }
            }));
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
