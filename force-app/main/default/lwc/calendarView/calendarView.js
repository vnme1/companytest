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
        return localDate.toISOString().slice(0, 10); // YYYY-MM-DD
    } catch (e) {
        console.error('날짜 변환 오류:', e);
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
            // 중복 이벤트 방지: 같은 ID의 이벤트가 이미 있는지 확인
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
        
        // 작은 지연을 두어 DOM이 완전히 렌더링된 후 실행
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
            console.error('Error loading FullCalendar:', error);
            this.fullCalendarInitialized = false; // 실패 시 다시 시도할 수 있도록
        }
    }

    initializeCalendar() {
        const calendarEl = this.template.querySelector('.calendar-container');
        if (!calendarEl) {
            console.error('Calendar container not found');
            return;
        }
        
        if (!window.FullCalendar) {
            console.error('FullCalendar not loaded');
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
                height: 800, // 고정 높이 픽셀 단위로 설정
                contentHeight: 700, // 컨텐츠 높이 설정
                events: this.eventSource.bind(this),
                drop: this.handleDrop.bind(this),
                eventClick: this.handleEventClick.bind(this),
                eventDrop: this.handleEventDrop.bind(this),
                eventReceive: this.handleEventReceive.bind(this),
                datesSet: this.handleDatesSet.bind(this),
                eventDidMount: (info) => {
                    console.log('Event mounted:', info.event.title);
                }
            });
            
            this.calendarApi = calendar;
            calendar.render();
            
            console.log('Calendar initialized successfully');
            
        } catch (error) {
            console.error('Error initializing calendar:', error);
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
            endDate.setDate(endDate.getDate() + 1); // ⬅️ 종료일에 1일 추가

            return {
                id: event.Id,
                title: event.Title__c,
                start: startDate,
                end: endDate.toISOString().slice(0, 10), // YYYY-MM-DD 형식으로
                allDay: false
            };
        });

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

    // 외부에서 드래그한 이벤트가 캘린더에 추가될 때 처리
    handleEventReceive(info) {
        // 외부에서 드래그한 이벤트는 임시로 제거하고 저장 후 다시 추가
        info.event.remove();
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
            const newStart = toYMD(info.event.start);

            // 🔽 FullCalendar는 end를 "다음날 00:00"로 주므로 하루 빼야 정확한 종료일
            let newEnd = newStart;
            if (info.event.end) {
                const adjustedEnd = new Date(info.event.end);
                adjustedEnd.setDate(adjustedEnd.getDate() - 1); // ⬅️ 여기서 하루 빼기
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