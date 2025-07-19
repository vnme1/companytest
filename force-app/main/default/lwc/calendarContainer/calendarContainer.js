/**
 * @description       : 캘린더 컨테이너 (최적화 버전 - 불필요한 로직 제거)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import saveEventAndCosts from '@salesforce/apex/CalendarAppController.saveEventAndCosts';
import getEventDetails from '@salesforce/apex/CalendarAppController.getEventDetails';
import deleteEvent from '@salesforce/apex/CalendarAppController.deleteEvent';
import getDepartmentOptions from '@salesforce/apex/CalendarAppController.getDepartmentOptions';
import getCostTypeOptions from '@salesforce/apex/CalendarAppController.getCostTypeOptions';

// === 상수 정의 ===
const RECORD_TYPES = {
    PERSONAL: 'Personal',
    ACCOUNT: 'Account',
    CONTACT: 'Contact',
    OPPORTUNITY: 'Opportunity'
};

const ERROR_MESSAGES = {
    INVALID_DROP_DATA: '드롭 이벤트 데이터가 유효하지 않습니다.',
    INVALID_DRAG_DATA: '드래그된 항목의 데이터가 유효하지 않습니다.',
    LOAD_OPTIONS_ERROR: '옵션을 불러오는 데 실패했습니다.',
    LOAD_EVENT_ERROR: '이벤트 정보를 불러오는 데 실패했습니다.'
};

// === 유틸리티 함수 (필수만) ===
function addOneDay(ymdStr) {
    const date = new Date(ymdStr);
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
}

function toLocalYMD(date) {
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 10);
}

export default class CalendarContainer extends LightningElement {
    // === 상태 관리 ===
    @track isModalOpen = false;
    @track modalTitle = '';
    @track currentMonthForSummary;

    // === 이벤트 데이터 ===
    @track recordId = null;
    @track eventTitle = '';
    @track eventStartDate = '';
    @track eventEndDate = '';
    @track eventDescription = '';
    @track eventLocation = '';
    @track eventDepartment = '';
    @track costItems = [];
    @track newEventData = { extendedProps: {} };

    // === 피클리스트 옵션 ===
    @track departmentPicklistOptions = [];
    @track costTypePicklistOptions = [];

    // === Computed Properties ===
    get isSalesforceObjectEvent() {
        return this.newEventData?.extendedProps?.recordType !== RECORD_TYPES.PERSONAL;
    }

    get isPersonalActivityEvent() {
        return this.newEventData?.extendedProps?.recordType === RECORD_TYPES.PERSONAL;
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

    // === 라이프사이클 ===
    connectedCallback() {
        const today = new Date();
        this.currentMonthForSummary = today.toISOString();
        this.loadPicklistOptions();
    }

    // === 피클리스트 로드 ===
    loadPicklistOptions() {
        Promise.all([getDepartmentOptions(), getCostTypeOptions()])
            .then(([departmentOptions, costTypeOptions]) => {
                this.departmentPicklistOptions = departmentOptions;
                this.costTypePicklistOptions = costTypeOptions;
            })
            .catch(() => this.showToast('오류', ERROR_MESSAGES.LOAD_OPTIONS_ERROR, 'error'));
    }

    // === 이벤트 드롭 처리 ===
    handleEventDrop(event) {
        try {
            const { draggedEl, date } = event.detail;
            
            if (!draggedEl || !date) {
                throw new Error(ERROR_MESSAGES.INVALID_DROP_DATA);
            }

            const { recordName, recordType, recordId, accountName } = draggedEl.dataset;
            if (!recordName || !recordType) {
                throw new Error(ERROR_MESSAGES.INVALID_DRAG_DATA);
            }

            // 직접 인라인 처리 (과도한 메서드 분리 제거)
            this.recordId = null;
            this.eventTitle = recordName;
            this.eventDepartment = this.departmentPicklistOptions[0]?.value || '';
            this.eventDescription = '';
            this.eventLocation = '';

            const localYMD = toLocalYMD(date);
            this.eventStartDate = localYMD;
            this.eventEndDate = localYMD;

            this.newEventData = {
                extendedProps: { recordType, relatedId: recordId, accountName: accountName || '' }
            };

            this.costItems = [{ id: 0, type: '', amount: null }];
            this.modalTitle = `새 ${recordType === RECORD_TYPES.PERSONAL ? '활동' : '이벤트'}: ${recordName}`;
            this.openModal();
        } catch (error) {
            this.showToast('오류', error.message, 'error');
        }
    }

    // === 기존 이벤트 클릭 처리 ===
    handleEventClick(event) {
        this.recordId = event.detail.eventId;
        if (!this.recordId) return;

        getEventDetails({ eventId: this.recordId })
            .then(result => {
                const evt = result.event;
                
                // 직접 인라인 처리 (과도한 분리 제거)
                this.eventTitle = evt.Title__c || '';
                this.eventStartDate = evt.Start_Date__c || '';
                this.eventEndDate = evt.End_Date__c || '';
                this.eventDescription = evt.Description__c || '';
                this.eventLocation = evt.Location__c || '';
                this.eventDepartment = (result.costs?.[0]?.department__c) || this.departmentPicklistOptions[0]?.value || '';

                this.newEventData = {
                    extendedProps: {
                        recordType: evt.Related_Record_Type__c,
                        relatedId: evt.Related_Record_Id__c,
                        accountName: result.accountName || ''
                    }
                };

                this.costItems = result.costs?.length > 0
                    ? result.costs.map((c, i) => ({ id: i, type: c.Cost_Type__c, amount: c.Amount__c }))
                    : [{ id: 0, type: '', amount: null }];

                this.modalTitle = `이벤트 수정: ${evt.Title__c}`;
                this.openModal();
            })
            .catch(() => this.showToast('오류', ERROR_MESSAGES.LOAD_EVENT_ERROR, 'error'));
    }

    // === 이벤트 저장 (검증 로직을 Apex에 위임) ===
    saveEvent() {
        // 기본 클라이언트 검증만 (서버사이드 검증은 Apex에서)
        if (!this.eventTitle) {
            this.showToast('입력 오류', '제목은 필수 입력 항목입니다.', 'error');
            return;
        }

        // 비용 데이터를 객체 배열로 전달 (JSON 직렬화는 Apex에서)
        const costData = this.costItems
            .filter(item => item.type && item.amount && Number(item.amount) > 0)
            .map(item => ({ type: item.type, amount: Number(item.amount) }));

        const saveParams = {
            recordId: this.recordId,
            title: this.eventTitle,
            startDate: this.eventStartDate,
            endDate: this.eventEndDate,
            description: this.eventDescription,
            location: this.eventLocation,
            department: this.eventDepartment,
            relatedId: this.newEventData?.extendedProps?.relatedId,
            recordType: this.newEventData?.extendedProps?.recordType,
            costDetailsJson: JSON.stringify(costData) // 임시로 유지 (Apex 개선 후 제거 예정)
        };

        saveEventAndCosts(saveParams)
            .then(savedEventId => {
                this.updateCalendarView(savedEventId);
                this.showToast('성공', '이벤트가 저장되었습니다.', 'success');
                this.closeModal();
                this.refreshCostSummary();
            })
            .catch(error => {
                const errorMessage = error?.body?.message || error?.message || '이벤트 저장 중 오류가 발생했습니다.';
                this.showToast('저장 오류', errorMessage, 'error');
            });
    }

    // === 이벤트 삭제 ===
    handleDelete() {
        if (!this.recordId) return;

        deleteEvent({ eventId: this.recordId })
            .then(() => {
                const calendarView = this.template.querySelector('c-calendar-view');
                if (calendarView) {
                    calendarView.removeEvent(this.recordId);
                }
                this.showToast('성공', '일정이 삭제되었습니다.', 'success');
                this.closeModal();
                this.refreshCostSummary();
            })
            .catch(error => {
                const errorMessage = error?.body?.message || error?.message || '일정 삭제 중 오류가 발생했습니다.';
                this.showToast('삭제 오류', errorMessage, 'error');
            });
    }

    // === 기타 이벤트 핸들러들 ===
    handleEventMoved(event) {
        this.showToast('성공', event.detail.message, 'success');
        this.refreshCostSummary();
    }

    handleEventError(event) {
        this.showToast('오류', event.detail.message, 'error');
    }

    handleDatesSet(event) {
        const startDate = new Date(event.detail.start);
        const endDate = new Date(event.detail.end);
        const viewMiddle = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);
        this.currentMonthForSummary = viewMiddle.toISOString();
        this.refreshCostSummary();
    }

    handleInputChange(event) {
        this[event.target.name] = event.target.value;
    }

    handleCostChange(event) {
        const itemId = parseInt(event.target.dataset.id, 10);
        const { name, value } = event.target;
        this.costItems = this.costItems.map(item =>
            item.id === itemId ? { ...item, [name]: value } : item
        );
    }

    addCostItem() {
        this.costItems = [...this.costItems, {
            id: this.costItems.length,
            type: '',
            amount: null
        }];
    }

    // === 헬퍼 메서드들 (필수만) ===
    updateCalendarView(savedEventId) {
        const calendarView = this.template.querySelector('c-calendar-view');
        if (!calendarView) return;

        if (this.recordId) {
            calendarView.updateEvent(this.recordId, {
                title: this.eventTitle,
                start: this.eventStartDate,
                end: addOneDay(this.eventEndDate)
            });
        } else {
            calendarView.addEvent({
                id: savedEventId,
                title: this.eventTitle,
                start: this.eventStartDate,
                end: addOneDay(this.eventEndDate),
                allDay: false
            });
        }
    }

    refreshCostSummary() {
        const costSummaryPanel = this.template.querySelector('c-cost-summary-panel');
        if (costSummaryPanel) {
            costSummaryPanel.updateMonth(this.currentMonthForSummary);
            costSummaryPanel.refreshSummary();
        }
    }

    // === 모달 관리 ===
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

    // === Toast 메시지 ===
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}