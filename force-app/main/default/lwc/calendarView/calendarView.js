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
    lastRefetchTime = 0; // 마지막 새로고침 시간 추적

    @api
    refetchEvents() {
        if (this.calendarApi) {
            // 중복 호출 방지 (100ms 내)
            const now = Date.now();
            if (now - this.lastRefetchTime < 100) {
                console.log('Refetch 중복 호출 방지');
                return;
            }
            this.lastRefetchTime = now;
            
            console.log('Events refetch 시작:', new Date().toLocaleTimeString());
            
            // 캐시 클리어를 위해 이벤트 소스를 완전히 새로고침
            this.calendarApi.getEventSources().forEach(eventSource => {
                eventSource.refetch();
            });
            
            // 추가로 전체 캘린더 refetch
            this.calendarApi.refetchEvents();
            
            console.log('Events refetch 완료');
        }
    }

    @api
    addEvent(eventData) {
        if (this.calendarApi) {
            const existingEvent = this.calendarApi.getEventById(eventData.id);
            if (!existingEvent) {
                console.log('새 이벤트 추가:', eventData);
                this.calendarApi.addEvent(eventData);
            } else {
                console.log('기존 이벤트 업데이트:', eventData);
                this.updateEvent(eventData.id, eventData);
            }
        }
    }

    @api
    updateEvent(eventId, eventData) {
        if (this.calendarApi) {
            const existingEvent = this.calendarApi.getEventById(eventId);
            if (existingEvent) {
                console.log('이벤트 업데이트:', eventId, eventData);
                existingEvent.setProp('title', eventData.title);
                existingEvent.setStart(eventData.start);
                existingEvent.setEnd(eventData.end);
                this.calendarApi.render();
            }
        }
    }

    @api
    removeEvent(eventId) {
        if (this.calendarApi) {
            const eventToRemove = this.calendarApi.getEventById(eventId);
            if (eventToRemove) {
                console.log('이벤트 제거:', eventId);
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
        if (!calendarEl || !window.FullCalendar) {
            console.error('Calendar container 또는 FullCalendar 라이브러리를 찾을 수 없습니다');
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
                
                // 타임존 설정
                timeZone: 'Asia/Seoul', // 한국 시간대 명시적 설정
                
                // 이벤트 소스 - 캐시 방지를 위한 동적 파라미터
                events: (fetchInfo, successCallback, failureCallback) => {
                    this.loadEventsWithNoCaching(fetchInfo, successCallback, failureCallback);
                },
                
                drop: this.handleDrop.bind(this),
                eventClick: this.handleEventClick.bind(this),
                eventDrop: this.handleEventDrop.bind(this),
                eventReceive: this.handleEventReceive.bind(this),
                datesSet: this.handleDatesSet.bind(this),
                
                eventDidMount: (info) => {
                    console.log('이벤트 마운트:', info.event.title, '시작시간:', info.event.start);
                },
                
                // 이벤트 색상 및 스타일
                eventColor: '#0176d3',
                eventTextColor: '#ffffff',
                dayMaxEvents: false,
                eventDisplay: 'auto',
                
                // 날짜 헤더 포맷
                dayHeaderFormat: { weekday: 'short' },
                
                // 뷰 변경 시 강제 새로고침
                viewDidMount: () => {
                    console.log('뷰 마운트 - 이벤트 새로고침');
                    setTimeout(() => {
                        this.refetchEvents();
                    }, 50);
                }
            });
            
            this.calendarApi = calendar;
            calendar.render();
            
            console.log('FullCalendar 초기화 완료');
            
        } catch (error) {
            console.error('캘린더 초기화 오류:', error);
        }
    }

    // 캐시 방지를 위한 이벤트 로딩 함수
    loadEventsWithNoCaching(fetchInfo, successCallback, failureCallback) {
        const startISO = fetchInfo.start.toISOString();
        const endISO = fetchInfo.end.toISOString();
        
        console.log('이벤트 로딩 시작:', {
            start: startISO,
            end: endISO,
            cacheBust: Date.now()
        });
        
        getEvents({
            startStr: startISO,
            endStr: endISO
        })
        .then(result => {
            console.log('서버에서 받은 원본 이벤트 데이터:', result);
            
            const events = result.map(event => {
                // 서버의 UTC 시간을 한국 시간으로 변환
                const startUTC = new Date(event.Start_DateTime__c);
                const endUTC = new Date(event.End_DateTime__c);
                
                // 한국 시간대로 변환 (UTC+9)
                const startKST = new Date(startUTC.getTime() + (9 * 60 * 60 * 1000));
                const endKST = new Date(endUTC.getTime() + (9 * 60 * 60 * 1000));
                
                console.log('이벤트 시간 변환:', {
                    title: event.Title__c,
                    originalStart: event.Start_DateTime__c,
                    originalEnd: event.End_DateTime__c,
                    convertedStart: startKST,
                    convertedEnd: endKST
                });
                
                return {
                    id: event.Id,
                    title: event.Title__c,
                    start: startKST,
                    end: endKST,
                    allDay: false
                };
            });
            
            console.log('캘린더에 표시될 최종 이벤트:', events);
            successCallback(events);
        })
        .catch(error => { 
            console.error('이벤트 로딩 오류:', error);
            failureCallback(error); 
        });
    }

    handleDrop(info) {
        info.jsEvent.preventDefault();
        
        // 드롭된 날짜를 정확히 처리
        const dropDate = info.date;
        
        console.log('드롭 이벤트 상세:', {
            originalDate: dropDate,
            year: dropDate.getFullYear(),
            month: dropDate.getMonth() + 1,
            date: dropDate.getDate(),
            day: dropDate.getDay(),
            hours: dropDate.getHours(),
            minutes: dropDate.getMinutes(),
            timezone: dropDate.getTimezoneOffset(),
            toString: dropDate.toString(),
            toDateString: dropDate.toDateString(),
            toISOString: dropDate.toISOString()
        });
        
        this.dispatchEvent(new CustomEvent('eventdrop', { 
            detail: {
                draggedEl: info.draggedEl,
                date: dropDate
            }
        }));
    }

    handleEventReceive(info) {
        console.log('외부 이벤트 수신:', info.event.title);
        info.event.remove();
    }

    handleEventClick(info) {
        console.log('이벤트 클릭:', {
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
            
            // 이동된 날짜를 정확히 처리 - 한국 시간으로
            const newStart = info.event.start;
            const newEnd = info.event.end || newStart;
            
            // 한국 시간을 UTC로 변환하여 서버에 전송
            const startUTC = new Date(newStart.getTime() - (9 * 60 * 60 * 1000));
            const endUTC = new Date(newEnd.getTime() - (9 * 60 * 60 * 1000));
            
            const newStartISO = this.formatDateForServer(startUTC);
            const newEndISO = this.formatDateForServer(endUTC);
            
            console.log('이벤트 이동 처리:', {
                eventId,
                localStart: newStart,
                localEnd: newEnd,
                utcStart: startUTC,
                utcEnd: endUTC,
                serverFormat: { start: newStartISO, end: newEndISO }
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
            console.error('이벤트 이동 오류:', error);
            this.dispatchEvent(new CustomEvent('eventerror', {
                detail: {
                    message: '일정 이동 중 오류가 발생했습니다.'
                }
            }));
            
            // 오류 발생 시 원래 위치로 되돌리기
            info.revert();
        }
    }

    // 서버 전송용 날짜 포맷
    formatDateForServer(date) {
        if (!date) return '';
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    handleDatesSet(dateInfo) {
        console.log('날짜 범위 변경:', {
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