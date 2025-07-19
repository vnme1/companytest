/**
 * @description       : 캘린더 컨테이너 메인 컴포넌트 (간결하게 리팩토링)
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
    TITLE_REQUIRED: '제목은 필수 입력 항목입니다.',
    DEPARTMENT_REQUIRED: '부서는 필수 선택 항목입니다.',
    INVALID_DROP_DATA: '드롭 이벤트 데이터가 유효하지 않습니다.',
    INVALID_DRAG_DATA: '드래그된 항목의 데이터가 유효하지 않습니다.',
    LOAD_OPTIONS_ERROR: '옵션을 불러오는 데 실패했습니다.',
    LOAD_EVENT_ERROR: '이벤트 정보를 불러오는 데 실패했습니다.'
};

// === 유틸리티 함수들 ===
function addOneDay(ymdStr) {
    const date = new Date(ymdStr);
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
}

function toLocalYMD(date) {
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 10);
}

function isValidDropData(draggedEl, date) {
    if (!draggedEl || !date) return false;
    const { recordName, recordType } = draggedEl.dataset;
    return recordName && recordType;
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
            .catch(() => this.showError(ERROR_MESSAGES.LOAD_OPTIONS_ERROR));
    }

    // === 이벤트 드롭 처리 ===
    handleEventDrop(event) {
        try {
            const { draggedEl, date } = event.detail;
            
            if (!isValidDropData(draggedEl, date)) {
                throw new Error(ERROR_MESSAGES.INVALID_DROP_DATA);
            }

            const { recordName, recordType, recordId, accountName } = draggedEl.dataset;
            if (!recordName || !recordType) {
                throw new Error(ERROR_MESSAGES.INVALID_DRAG_DATA);
            }

            this.setupNewEvent(recordName, recordType, recordId, accountName, date);
            this.openModal();
        } catch (error) {
            this.showError(error.message);
        }
    }

    // === 새 이벤트 설정 ===
    setupNewEvent(recordName, recordType, recordId, accountName, date) {
        this.recordId = null;
        this.eventTitle = recordName;
        this.eventDepartment = this.getDefaultDepartment();
        this.eventDescription = '';
        this.eventLocation = '';

        const localYMD = toLocalYMD(date);
        this.eventStartDate = localYMD;
        this.eventEndDate = localYMD;

        this.newEventData = {
            extendedProps: {
                recordType,
                relatedId: recordId,
                accountName: accountName || ''
            }
        };

        this.costItems = [this.createEmptyCostItem()];
        this.modalTitle = `새 ${recordType === RECORD_TYPES.PERSONAL ? '활동' : '이벤트'}: ${recordName}`;
    }

    // === 기존 이벤트 클릭 처리 ===
    handleEventClick(event) {
        this.recordId = event.detail.eventId;
        if (!this.recordId) return;

        getEventDetails({ eventId: this.recordId })
            .then(result => this.setupExistingEvent(result))
            .then(() => this.openModal())
            .catch(() => this.showError(ERROR_MESSAGES.LOAD_EVENT_ERROR));
    }

    // === 기존 이벤트 설정 ===
    setupExistingEvent(result) {
        const evt = result.event;
        
        this.setBasicEventData(evt);
        this.setDepartmentData(result.costs);
        this.setExtendedProps(evt, result.accountName);
        this.setCostItems(result.costs);
        
        this.modalTitle = `이벤트 수정: ${evt.Title__c}`;
    }

    setBasicEventData(evt) {
        this.eventTitle = evt.Title__c || '';
        this.eventStartDate = evt.Start_Date__c || '';
        this.eventEndDate = evt.End_Date__c || '';
        this.eventDescription = evt.Description__c || '';
        this.eventLocation = evt.Location__c || '';
    }

    setDepartmentData(costs) {
        this.eventDepartment = (costs && costs.length > 0 && costs[0].department__c) 
            ? costs[0].department__c 
            : this.getDefaultDepartment();
    }

    setExtendedProps(evt, accountName) {
        this.newEventData = {
            extendedProps: {
                recordType: evt.Related_Record_Type__c,
                relatedId: evt.Related_Record_Id__c,
                accountName: accountName || ''
            }
        };
    }

    setCostItems(costs) {
        this.costItems = (costs && costs.length > 0)
            ? costs.map((c, i) => ({ id: i, type: c.Cost_Type__c, amount: c.Amount__c }))
            : [this.createEmptyCostItem()];
    }

    // === 이벤트 저장 ===
    saveEvent() {
        if (!this.validateEventData()) return;

        const saveParams = this.buildSaveParams();

        saveEventAndCosts(saveParams)
            .then(savedEventId => this.handleSaveSuccess(savedEventId))
            .catch(error => this.handleSaveError(error));
    }

    validateEventData() {
        if (!this.eventTitle) {
            this.showError(ERROR_MESSAGES.TITLE_REQUIRED);
            return false;
        }

        if (!this.eventDepartment && this.isSalesforceObjectEvent) {
            this.showError(ERROR_MESSAGES.DEPARTMENT_REQUIRED);
            return false;
        }

        return true;
    }

    buildSaveParams() {
        const validCostItems = this.getValidCostItems();

        return {
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
    }

    getValidCostItems() {
        return this.costItems
            .filter(item => item.type && item.amount && Number(item.amount) > 0)
            .map(item => ({
                type: String(item.type),
                amount: Number(item.amount)
            }));
    }

    handleSaveSuccess(savedEventId) {
        this.updateCalendarView(savedEventId);
        this.showSuccess('이벤트가 저장되었습니다.');
        this.closeModal();
        this.refreshCostSummary();
    }

    handleSaveError(error) {
        const errorMessage = this.extractErrorMessage(error) || '이벤트 저장 중 오류가 발생했습니다.';
        this.showError(errorMessage);
    }

    // === 이벤트 삭제 ===
    handleDelete() {
        if (!this.recordId) return;

        deleteEvent({ eventId: this.recordId })
            .then(() => this.handleDeleteSuccess())
            .catch(error => this.handleDeleteError(error));
    }

    handleDeleteSuccess() {
        const calendarView = this.template.querySelector('c-calendar-view');
        if (calendarView) {
            calendarView.removeEvent(this.recordId);
        }
        this.showSuccess('일정이 삭제되었습니다.');
        this.closeModal();
        this.refreshCostSummary();
    }

    handleDeleteError(error) {
        const errorMessage = this.extractErrorMessage(error) || '일정 삭제 중 오류가 발생했습니다.';
        this.showError(errorMessage);
    }

    // === 기타 이벤트 핸들러들 ===
    handleEventMoved(event) {
        this.showSuccess(event.detail.message);
        this.refreshCostSummary();
    }

    handleEventError(event) {
        this.showError(event.detail.message);
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

    // === 헬퍼 메서드들 ===
    getDefaultDepartment() {
        return this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '';
    }

    createEmptyCostItem() {
        return { id: 0, type: '', amount: null };
    }

    extractErrorMessage(error) {
        return error?.body?.message || error?.message;
    }

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
        this.resetModalData();
    }

    resetModalData() {
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
    showSuccess(message) {
        this.dispatchEvent(new ShowToastEvent({
            title: '성공',
            message: message,
            variant: 'success'
        }));
    }

    showError(message) {
        this.dispatchEvent(new ShowToastEvent({
            title: '오류',
            message: message,
            variant: 'error'
        }));
    }
}