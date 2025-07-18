/**
 * @description       : 캘린더 컨테이너 메인 컴포넌트 - 상태 동기화 개선 + 바 형태 표시
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Apex 메소드 import
import saveEventAndCosts from '@salesforce/apex/CalendarAppController.saveEventAndCosts';
import getEventDetails from '@salesforce/apex/CalendarAppController.getEventDetails';
import deleteEvent from '@salesforce/apex/CalendarAppController.deleteEvent';
import getDepartmentOptions from '@salesforce/apex/CalendarAppController.getDepartmentOptions';
import getCostTypeOptions from '@salesforce/apex/CalendarAppController.getCostTypeOptions';

export default class CalendarContainer extends LightningElement {
    @track isModalOpen = false;
    @track modalTitle = '';
    @track currentMonthForSummary;

    // 모달 필드 변수
    @track recordId = null;
    @track eventTitle = '';
    @track eventStartDate = '';
    @track eventEndDate = '';
    @track eventDescription = '';
    @track eventLocation = '';
    @track eventDepartment = '';
    @track costItems = [];
    @track newEventData = { extendedProps: {} };
    
    @track departmentPicklistOptions = [];
    @track costTypePicklistOptions = [];
    
    // 🔥 로컬 이벤트 캐시 추가
    @track localEventCache = new Map();
    
    get isSalesforceObjectEvent() { 
        return this.newEventData?.extendedProps?.recordType !== 'Personal'; 
    }
    
    get isPersonalActivityEvent() { 
        return this.newEventData?.extendedProps?.recordType === 'Personal'; 
    }
    
    get displayAccountName() { 
        return this.newEventData?.extendedProps?.accountName || ''; 
    }
    
    get departmentOptions() { 
        return this.departmentPicklistOptions; 
    }
    
    get costTypeOptions() { 
        return this.costTypePicklistOptions; 
    }

    connectedCallback() {
        const today = new Date();
        this.currentMonthForSummary = today.toISOString();
        this.loadPicklistOptions();
    }

    async loadPicklistOptions() {
        try {
            const [departmentOptions, costTypeOptions] = await Promise.all([
                getDepartmentOptions(),
                getCostTypeOptions()
            ]);
            
            this.departmentPicklistOptions = departmentOptions;
            this.costTypePicklistOptions = costTypeOptions;
        } catch (error) {
            console.error('Error loading picklist options:', error);
            this.showToast('오류', '옵션을 불러오는 데 실패했습니다.', 'error');
        }
    }
    
    // 🔥 이벤트 드롭 처리 - 날짜 처리 개선
    handleEventDrop(event) {
        try {
            const { draggedEl, date } = event.detail;
            
            if (!draggedEl || !date) {
                throw new Error('드롭 이벤트 데이터가 유효하지 않습니다.');
            }
            
            const { recordName, recordType, recordId, accountName } = draggedEl.dataset;

            if (!recordName || !recordType) {
                throw new Error('드래그된 항목의 데이터가 유효하지 않습니다.');
            }

            this.recordId = null;
            this.eventTitle = recordName;
            this.eventDepartment = this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '';
            this.eventDescription = '';
            this.eventLocation = '';

            // 🔥 날짜 처리 개선 - 로컬 타임존 고려
            const startDate = new Date(date);
            // 로컬 시간으로 변환 (타임존 오프셋 제거하지 않음)
            const year = startDate.getFullYear();
            const month = String(startDate.getMonth() + 1).padStart(2, '0');
            const day = String(startDate.getDate()).padStart(2, '0');
            const isoString = `${year}-${month}-${day}T09:00`; // 기본 오전 9시로 설정
            
            this.eventStartDate = isoString;
            this.eventEndDate = isoString;

            this.newEventData = { 
                extendedProps: { 
                    recordType, 
                    relatedId: recordId, 
                    accountName: accountName || '' 
                } 
            };
            
            this.costItems = [{ id: 0, type: '', amount: null }];
            this.modalTitle = `새 ${recordType === 'Personal' ? '활동' : '이벤트'}: ${recordName}`;
            this.openModal();
            
        } catch (error) {
            console.error('이벤트 드롭 처리 오류:', error);
            this.showToast('오류', error.message || '드래그 앤 드롭 처리 중 오류가 발생했습니다.', 'error');
        }
    }

    // 🔥 이벤트 클릭 처리 개선 - 날짜 표시 수정
    async handleEventClick(event) {
        this.recordId = event.detail.eventId;
        if (!this.recordId) return;

        try {
            // 로컬 캐시에서 먼저 확인
            let result = this.localEventCache.get(this.recordId);
            
            if (!result) {
                // 캐시에 없으면 서버에서 가져오기
                result = await getEventDetails({ eventId: this.recordId });
                // 캐시에 저장
                this.localEventCache.set(this.recordId, result);
            }
            
            const evt = result.event;

            this.eventTitle = evt.Title__c || '';
            
            // 🔥 날짜 표시 개선 - 로컬 시간으로 변환
            if (evt.Start_DateTime__c) {
                const startDate = new Date(evt.Start_DateTime__c);
                // 로컬 시간으로 표시 (YYYY-MM-DDTHH:MM 형식)
                this.eventStartDate = new Date(startDate.getTime()).toISOString().slice(0, 16);
            } else {
                this.eventStartDate = '';
            }
            
            if (evt.End_DateTime__c) {
                const endDate = new Date(evt.End_DateTime__c);
                // 로컬 시간으로 표시
                this.eventEndDate = new Date(endDate.getTime()).toISOString().slice(0, 16);
            } else {
                this.eventEndDate = '';
            }
            
            this.eventDescription = evt.Description__c || '';
            this.eventLocation = evt.Location__c || '';
            
            // 부서 정보 설정
            if (result.costs && result.costs.length > 0 && result.costs[0].department__c) {
                this.eventDepartment = result.costs[0].department__c;
            } else {
                this.eventDepartment = this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '';
            }
            
            // 관련 레코드 정보 설정
            this.newEventData = {
                extendedProps: {
                    recordType: evt.Related_Record_Type__c,
                    relatedId: evt.Related_Record_Id__c,
                    accountName: result.accountName || ''
                }
            };
            
            // 비용 아이템 설정
            this.costItems = result.costs && result.costs.length > 0 
                ? result.costs.map((c, i) => ({ 
                    id: i, 
                    type: c.Cost_Type__c, 
                    amount: c.Amount__c 
                }))
                : [{ id: 0, type: '', amount: null }];

            this.modalTitle = `이벤트 수정: ${evt.Title__c}`;
            this.openModal();
        } catch (error) {
            console.error('Error loading event details:', error);
            this.showToast('오류', '이벤트 정보를 불러오는 데 실패했습니다.', 'error');
        }
    }

    // 이벤트 이동 성공 처리
    handleEventMoved(event) {
        // 🔥 로컬 캐시 무효화
        const eventId = event.detail.eventId;
        if (eventId) {
            this.localEventCache.delete(eventId);
        }
        
        this.showToast('성공', event.detail.message, 'success');
        this.refreshCostSummary();
    }

    // 이벤트 오류 처리
    handleEventError(event) {
        this.showToast('오류', event.detail.message, 'error');
    }
    
    // 날짜 변경 처리
    handleDatesSet(event) { 
        const startDate = new Date(event.detail.start);
        const endDate = new Date(event.detail.end);
        
        const viewMiddle = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);
        
        this.currentMonthForSummary = viewMiddle.toISOString();
        this.refreshCostSummary();
    }
    
    // 입력 필드 변경 처리
    handleInputChange(event) { 
        this[event.target.name] = event.target.value; 
    }

    // 비용 항목 변경 처리
    handleCostChange(event) {
        const itemId = parseInt(event.target.dataset.id, 10);
        const { name, value } = event.target;
        this.costItems = this.costItems.map(item => 
            item.id === itemId ? { ...item, [name]: value } : item
        );
    }
    
    // 비용 항목 추가
    addCostItem() { 
        this.costItems = [...this.costItems, { 
            id: this.costItems.length, 
            type: '', 
            amount: null 
        }]; 
    }
    
    // 🔥 이벤트 저장 개선 - 로컬 캐시 업데이트 + 바 형태 표시
    async saveEvent() {
        // 기본 유효성 검사
        if (!this.eventTitle) {
            this.showToast('입력 오류', '제목은 필수 입력 항목입니다.', 'error');
            return;
        }

        if (!this.eventDepartment && this.isSalesforceObjectEvent) {
            this.showToast('입력 오류', '부서는 필수 선택 항목입니다.', 'error');
            return;
        }

        try {
            // 유효한 비용 항목만 필터링
            const validCostItems = this.costItems
                .filter(item => item.type && item.amount && Number(item.amount) > 0)
                .map(item => ({
                    type: String(item.type),
                    amount: Number(item.amount)
                }));

            const params = {
                recordId: this.recordId,
                title: this.eventTitle,
                startDate: this.eventStartDate,
                endDate: this.eventEndDate,
                description: this.eventDescription,
                location: this.eventLocation,
                department: this.eventDepartment,
                relatedId: this.newEventData?.extendedProps?.relatedId,
                recordType: this.newEventData?.extendedProps?.recordType,
                costDetailsJson: JSON.stringify(validCostItems)
            };
            
            const savedEventId = await saveEventAndCosts(params);
            
            // 🔥 로컬 캐시 업데이트
            if (this.recordId) {
                // 기존 이벤트 수정 시 캐시 무효화
                this.localEventCache.delete(this.recordId);
            }
            
            // 🔥 캘린더 업데이트 - 색상 정보 포함
            const calendarView = this.template.querySelector('c-calendar-view');
            if (calendarView) {
                const recordType = this.newEventData?.extendedProps?.recordType;
                
                if (this.recordId) {
                    calendarView.updateEvent(this.recordId, {
                        title: this.eventTitle,
                        start: this.eventStartDate,
                        end: this.eventEndDate,
                        recordType: recordType
                    });
                } else {
                    // 새 이벤트 색상 설정
                    const colorMap = {
                        'Personal': '#28a745',      // 초록색 - 개인활동
                        'Account': '#0176d3',       // 파란색 - Account 관련
                        'Contact': '#ff6b35',       // 주황색 - Contact 관련  
                        'Opportunity': '#6f42c1'    // 보라색 - Opportunity 관련
                    };
                    const color = colorMap[recordType] || '#6c757d';
                    
                    // 🔥 새 이벤트 추가 시 바 형태로 표시
                    const startDate = new Date(this.eventStartDate);
                    const endDate = new Date(this.eventEndDate);
                    
                    // 하루 일정인지 확인
                    const isAllDay = startDate.toDateString() === endDate.toDateString();
                    
                    let eventStart, eventEnd;
                    if (isAllDay) {
                        // 하루 일정은 allDay로 설정
                        eventStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                        eventEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1);
                    } else {
                        eventStart = this.eventStartDate;
                        eventEnd = this.eventEndDate;
                    }
                    
                    calendarView.addEvent({
                        id: savedEventId,
                        title: this.eventTitle,
                        start: eventStart,
                        end: eventEnd,
                        allDay: isAllDay,
                        backgroundColor: color,
                        borderColor: color,
                        textColor: '#ffffff',
                        extendedProps: {
                            recordType: recordType
                        }
                    });
                }
            }
            
            this.showToast('성공', '이벤트가 저장되었습니다.', 'success');
            this.closeModal();
            this.refreshCostSummary();
            
        } catch (error) {
            console.error('이벤트 저장 오류:', error);
            const errorMessage = error.body?.message || error.message || '이벤트 저장 중 오류가 발생했습니다.';
            this.showToast('저장 오류', errorMessage, 'error');
        }
    }

    // 🔥 이벤트 삭제 개선 - 로컬 캐시 정리
    async handleDelete() {
        if (!this.recordId) return;
        
        try {
            await deleteEvent({ eventId: this.recordId });
            
            // 🔥 로컬 캐시에서 삭제
            this.localEventCache.delete(this.recordId);
            
            const calendarView = this.template.querySelector('c-calendar-view');
            if (calendarView) {
                calendarView.removeEvent(this.recordId);
            }
            
            this.showToast('성공', '일정이 삭제되었습니다.', 'success');
            this.closeModal();
            this.refreshCostSummary();
            
        } catch (error) {
            console.error('이벤트 삭제 오류:', error);
            const errorMessage = error.body?.message || error.message || '일정 삭제 중 오류가 발생했습니다.';
            this.showToast('삭제 오류', errorMessage, 'error');
        }
    }

    // 비용 요약 새로고침
    refreshCostSummary() {
        const costSummaryPanel = this.template.querySelector('c-cost-summary-panel');
        if (costSummaryPanel) {
            costSummaryPanel.updateMonth(this.currentMonthForSummary);
            costSummaryPanel.refreshSummary();
        }
    }

    // 모달 관련 함수들
    openModal() { 
        this.isModalOpen = true; 
    }

    closeModal() {
        this.isModalOpen = false;
        this.recordId = null;
        this.eventTitle = '';
        this.eventStartDate = '';
        this.eventEndDate = '';
        this.eventDescription = '';
        this.eventLocation = '';
        this.eventDepartment = '';
        this.costItems = [];
        this.newEventData = { extendedProps: {} };
    }
    
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}