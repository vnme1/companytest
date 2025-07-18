/**
 * @description       : 캘린더 뷰 컴포넌트 - 이벤트 색상 구분 기능 추가
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

    // 🔥 이벤트 타입별 색상 정의 - 새로 추가된 메서드
    getEventColor(recordType) {
        const colorMap = {
            'Personal': '#28a745',      // 초록색 - 개인활동
            'Account': '#0176d3',       // 파란색 - Account 관련
            'Contact': '#ff6b35',       // 주황색 - Contact 관련  
            'Opportunity': '#6f42c1'    // 보라색 - Opportunity 관련
        };
        
        return colorMap[recordType] || '#6c757d'; // 기본 회색
    }

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
                
                // 🔥 색상도 업데이트 - 새로 추가된 부분
                if (eventData.recordType) {
                    const color = this.getEventColor(eventData.recordType);
                    existingEvent.setProp('backgroundColor', color);
                    existingEvent.setProp('borderColor', color);
                }
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
            console.error('Error loading FullCalendar:', error);
            this.fullCalendarInitialized = false;
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

    // 🔥 이벤트 소스 - 타임존 문제 완전 해결
    eventSource(fetchInfo, successCallback, failureCallback) {
        getEvents({
            startStr: fetchInfo.start.toISOString(),
            endStr: fetchInfo.end.toISOString()
        })
        .then(result => {
            const events = result.map(event => {
                // 🔥 이벤트 타입에 따른 색상 설정
                const recordType = event.Related_Record_Type__c;
                const color = this.getEventColor(recordType);
                
                // 🔥 날짜 처리 완전 개선 - 서버 날짜를 날짜만 추출
                const startDateTimeStr = event.Start_DateTime__c; // "2025-07-08T23:00:00.000Z"
                const endDateTimeStr = event.End_DateTime__c;     // "2025-07-10T14:00:00.000Z"
                
                // ISO 문자열에서 날짜 부분만 추출하여 로컬 Date 객체 생성
                const startDatePart = startDateTimeStr.substring(0, 10); // "2025-07-08"
                const endDatePart = endDateTimeStr.substring(0, 10);     // "2025-07-10"
                
                // 날짜만으로 Date 객체 생성 (시간은 00:00:00으로 설정)
                const startDate = new Date(startDatePart + 'T00:00:00');
                let endDate = new Date(endDatePart + 'T00:00:00');
                
                // FullCalendar에서 allDay 이벤트의 종료일은 다음날이어야 함
                endDate.setDate(endDate.getDate() + 1);
                
                console.log('Event processing:', {
                    title: event.Title__c,
                    originalStart: startDateTimeStr,
                    originalEnd: endDateTimeStr,
                    displayStart: startDate,
                    displayEnd: endDate,
                    startDatePart: startDatePart,
                    endDatePart: endDatePart
                });
                
                return {
                    id: event.Id,
                    title: event.Title__c,
                    start: startDate,
                    end: endDate,
                    allDay: true, // 🔥 모든 이벤트를 allDay로 설정하여 바 형태로 표시
                    // 🔥 색상 속성 추가
                    backgroundColor: color,
                    borderColor: color,
                    textColor: '#ffffff',
                    // 추가 데이터
                    extendedProps: {
                        recordType: recordType
                    }
                };
            });
            
            console.log('Final events for calendar:', events);
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