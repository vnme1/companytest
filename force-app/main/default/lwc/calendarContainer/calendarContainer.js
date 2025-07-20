/**
 * @description       : 캘린더 컨테이너 (Custom Label 적용 버전)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Custom Labels import
import LABEL_INPUT_ERROR from '@salesforce/label/c.LABEL_INPUT_ERROR';
import LABEL_REQUIRED_TITLE from '@salesforce/label/c.LABEL_REQUIRED_TITLE';
import LABEL_SUCCESS_SAVE from '@salesforce/label/c.LABEL_SUCCESS_SAVE';
import LABEL_EVENT_SAVED from '@salesforce/label/c.LABEL_EVENT_SAVED';
import LABEL_SAVE_ERROR from '@salesforce/label/c.LABEL_SAVE_ERROR';
import LABEL_SUCCESS_DELETE from '@salesforce/label/c.LABEL_SUCCESS_DELETE';

// Apex Methods
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

// === 유틸리티 함수 ===
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

    // === 이벤트 저장 (Custom Label 적용) ===
    saveEvent() {
        if (!this.eventTitle) {
            this.showToast(LABEL_INPUT_ERROR, LABEL_REQUIRED_TITLE, 'error');
            return;
        }

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
            costDetailsJson: JSON.stringify(costData)
        };

        saveEventAndCosts(saveParams)
            .then(savedEventId => {
                this.updateCalendarView(savedEventId);
                this.showToast(LABEL_SUCCESS_SAVE, LABEL_EVENT_SAVED, 'success');
                this.closeModal();
                this.refreshCostSummary();
            })
            .catch(error => {
                const errorMessage = error?.body?.message || error?.message || '이벤트 저장 중 오류가 발생했습니다.';
                this.showToast(LABEL_SAVE_ERROR, errorMessage, 'error');
            });
    }

    // === 이벤트 삭제 (Custom Label 적용) ===
    handleDelete() {
        if (!this.recordId) return;

        deleteEvent({ eventId: this.recordId })
            .then(() => {
                const calendarView = this.template.querySelector('c-calendar-view');
                if (calendarView) {
                    calendarView.removeEvent(this.recordId);
                }
                this.showToast(LABEL_SUCCESS_SAVE, LABEL_SUCCESS_DELETE, 'success');
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

    // === 캘린더 업데이트 ===
    updateCalendarView(savedEventId) {
        const calendarView = this.template.querySelector('c-calendar-view');
        if (!calendarView) return;

        const eventData = {
            title: this.eventTitle,
            start: this.eventStartDate,
            end: addOneDay(this.eventEndDate),
            allDay: true
        };

        if (this.recordId) {
            calendarView.updateEvent(this.recordId, eventData);
        } else {
            calendarView.addEvent({
                id: savedEventId,
                ...eventData
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