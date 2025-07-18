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
            console.log('Refetching events...');
            // 강제로 이벤트 캐시 클리어 후 새로고침
            this.calendarApi.refetchEvents();
        }
    }

    @api
    addEvent(eventData) {
        if (this.calendarApi) {
            // 중복 이벤트 방지: 같은 ID의 이벤트가 이미 있는지 확인
            const existingEvent = this.calendarApi.getEventById(eventData.id);
            if (!existingEvent) {
                console.log('Adding new event:', eventData);
                this.calendarApi.addEvent(eventData);
            } else {
                console.log('Event already exists, updating instead:', eventData);
                this.updateEvent(eventData.id, eventData);
            }
        }
    }

    @api
    updateEvent(eventId, eventData) {
        if (this.calendarApi) {
            const existingEvent = this.calendarApi.getEventById(eventId);
            if (existingEvent) {
                console.log('Updating existing event:', eventId, eventData);
                existingEvent.setProp('title', eventData.title);
                existingEvent.setStart(eventData.start);
                existingEvent.setEnd(eventData.end);
                
                // 강제로 캘린더 다시 렌더링
                this.calendarApi.render();
            } else {
                console.log('Event not found for update, adding as new:', eventData);
                this.addEvent({ id: eventId, ...eventData });
            }
        }
    }

    @api
    removeEvent(eventId) {
        if (this.calendarApi) {
            const eventToRemove = this.calendarApi.getEventById(eventId);
            if (eventToRemove) {
                console.log('Removing event:', eventId);
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
                height: 800,
                contentHeight: 700,
                
                // 타임존 설정 - 로컬 타임존 사용
                timeZone: 'local',
                
                // 이벤트 소스 설정 - 캐싱 완전 비활성화
                events: {
                    url: this.eventSource.bind(this),
                    extraParams: () => ({
                        _cache_bust: Date.now() // 캐시 방지
                    })
                },
                
                // 커스텀 이벤트 소스 함수
                events: this.eventSource.bind(this),
                
                eventSourceSuccess: () => {
                    console.log('Events loaded successfully');
                },
                eventSourceFailure: (error) => {
                    console.error('Failed to load events:', error);
                },
                
                drop: this.handleDrop.bind(this),
                eventClick: this.handleEventClick.bind(this),
                eventDrop: this.handleEventDrop.bind(this),
                eventReceive: this.handleEventReceive.bind(this),
                datesSet: this.handleDatesSet.bind(this),
                eventDidMount: (info) => {
                    console.log('Event mounted:', info.event.title, 'Start:', info.event.start);
                },
                
                // 이벤트 표시 개선
                dayMaxEvents: false,
                eventDisplay: 'auto',
                
                // 날짜 표시 포맷 설정
                dayHeaderFormat: { weekday: 'short' },
                
                // 이벤트 색상 설정
                eventColor: '#0176d3',
                eventTextColor: '#ffffff',
                
                // 뷰 변경 시 이벤트 새로고침
                viewDidMount: () => {
                    console.log('View mounted, refreshing events');
                    setTimeout(() => {
                        if (this.calendarApi) {
                            this.calendarApi.refetchEvents();
                        }
                    }, 100);
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
        console.log('Loading events for date range:', {
            start: fetchInfo.start,
            end: fetchInfo.end,
            startISO: fetchInfo.start.toISOString(),
            endISO: fetchInfo.end.toISOString()
        });
        
        getEvents({
            startStr: fetchInfo.start.toISOString(),
            endStr: fetchInfo.end.toISOString()
        })
        .then(result => {
            console.log('Raw event data from server:', result);
            
            const events = result.map(event => {
                // 서버에서 받은 UTC 시간을 로컬 시간으로 처리
                const eventStart = new Date(event.Start_DateTime__c);
                const eventEnd = new Date(event.End_DateTime__c);
                
                console.log('Processing event:', {
                    title: event.Title__c,
                    rawStart: event.Start_DateTime__c,
                    rawEnd: event.End_DateTime__c,
                    processedStart: eventStart,
                    processedEnd: eventEnd
                });
                
                return {
                    id: event.Id,
                    title: event.Title__c,
                    start: eventStart,
                    end: eventEnd,
                    allDay: false
                };
            });
            
            console.log('Processed events for calendar:', events);
            successCallback(events);
        })
        .catch(error => { 
            console.error('Error fetching events:', error);
            failureCallback(error); 
        });
    }

    handleDrop(info) {
        info.jsEvent.preventDefault();
        
        // 드롭된 날짜를 로컬 시간대로 정확히 처리
        const dropDate = info.date;
        
        console.log('Drop event:', {
            originalDate: dropDate,
            dateString: dropDate.toString(),
            isoString: dropDate.toISOString(),
            localeDateString: dropDate.toLocaleDateString(),
            draggedElement: info.draggedEl.dataset
        });
        
        this.dispatchEvent(new CustomEvent('eventdrop', { 
            detail: {
                draggedEl: info.draggedEl,
                date: dropDate // Date 객체 그대로 전달
            }
        }));
    }

    // 외부에서 드래그한 이벤트가 캘린더에 추가될 때 처리
    handleEventReceive(info) {
        console.log('Event received from external source:', info.event.title);
        // 외부에서 드래그한 이벤트는 임시로 제거하고 저장 후 다시 추가
        info.event.remove();
    }

    handleEventClick(info) {
        console.log('Event clicked:', {
            eventId: info.event.id,
            title: info.event.title,
            start: info.event.start,
            end: info.event.end
        });
        
        this.dispatchEvent(new CustomEvent('eventclick', { 
            detail: { eventId: info.event.id } 
        }));
    }

    // 드래그앤드롭으로 일정 이동 처리
    async handleEventDrop(info) {
        try {
            const eventId = info.event.id;
            
            // 이동된 날짜를 정확히 처리
            const newStart = info.event.start;
            const newEnd = info.event.end || newStart;
            
            // 로컬 시간으로 포맷
            const newStartISO = this.formatDateToLocal(newStart);
            const newEndISO = this.formatDateToLocal(newEnd);
            
            console.log('Event dropped:', {
                eventId,
                newStart,
                newEnd,
                newStartISO,
                newEndISO
            });
            
            await updateEventDates({
                eventId: eventId,
                newStartDate: newStartISO,
                newEndDate: newEndISO
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

    // 날짜를 로컬 시간대로 포맷하는 함수
    formatDateToLocal(date) {
        if (!date) return '';
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    handleDatesSet(dateInfo) {
        console.log('Dates set:', {
            start: dateInfo.start,
            end: dateInfo.end,
            startISO: dateInfo.start.toISOString(),
            endISO: dateInfo.end.toISOString()
        });
        
        this.dispatchEvent(new CustomEvent('dateset', {
            detail: { 
                start: dateInfo.start.toISOString(),
                end: dateInfo.end.toISOString()
            }
        }));
    }
}