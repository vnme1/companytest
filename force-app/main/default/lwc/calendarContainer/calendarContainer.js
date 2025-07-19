/**
 * @description       : 캘린더 컨테이너 메인 컴포넌트 (Promise 방식으로 통일)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import saveEventAndCosts from '@salesforce/apex/CalendarAppController.saveEventAndCosts';
import getEventDetails from '@salesforce/apex/CalendarAppController.getEventDetails';
import deleteEvent from '@salesforce/apex/CalendarAppController.deleteEvent';
import getDepartmentOptions from '@salesforce/apex/CalendarAppController.getDepartmentOptions';
import getCostTypeOptions from '@salesforce/apex/CalendarAppController.getCostTypeOptions';

// 날짜 처리 유틸리티 함수
const DateUtils = {
    addOneDay: (ymdStr) => {
        const date = new Date(ymdStr);
        date.setDate(date.getDate() + 1);
        return date.toISOString().slice(0, 10);
    },
    
    toLocalYMD: (date) => {
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().slice(0, 10);
    }
};

export default class CalendarContainer extends LightningElement {
    // 모달 상태 관리
    @track isModalOpen = false;
    @track modalTitle = '';
    @track currentMonthForSummary;

    // 이벤트 데이터
    @track recordId = null;
    @track eventTitle = '';
    @track eventStartDate = '';
    @track eventEndDate = '';
    @track eventDescription = '';
    @track eventLocation = '';
    @track eventDepartment = '';
    @track costItems = [];
    @track newEventData = { extendedProps: {} };

    // 피클리스트 옵션
    @track departmentPicklistOptions = [];
    @track costTypePicklistOptions = [];

    // Getter 메서드들
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

    // Promise 방식으로 통일된 피클리스트 로드
    loadPicklistOptions() {
        Promise.all([
            getDepartmentOptions(),
            getCostTypeOptions()
        ])
        .then(([departmentOptions, costTypeOptions]) => {
            this.departmentPicklistOptions = departmentOptions;
            this.costTypePicklistOptions = costTypeOptions;
        })
        .catch(error => {
            this.showToast('오류', '옵션을 불러오는 데 실패했습니다.', 'error');
        });
    }

    // 이벤트 핸들러들
    handleEventDrop(event) {
        try {
            const { draggedEl, date } = event.detail;
            this.validateDropData(draggedEl, date);

            const eventData = this.extractDropEventData(draggedEl, date);
            this.setupNewEvent(eventData);
            this.openModal();
        } catch (error) {
            this.showToast('오류', error.message, 'error');
        }
    }

    handleEventClick(event) {
        this.recordId = event.detail.eventId;
        if (!this.recordId) return;

        getEventDetails({ eventId: this.recordId })
            .then(result => {
                this.setupExistingEvent(result);
                this.openModal();
            })
            .catch(error => {
                this.showToast('오류', '이벤트 정보를 불러오는 데 실패했습니다.', 'error');
            });
    }

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

    // 이벤트 저장 - Promise 방식으로 통일
    saveEvent() {
        if (!this.validateEventData()) {
            return;
        }

        const saveParams = this.buildSaveParams();

        saveEventAndCosts(saveParams)
            .then(savedEventId => {
                this.updateCalendarView(savedEventId);
                this.showToast('성공', '이벤트가 저장되었습니다.', 'success');
                this.closeModal();
                this.refreshCostSummary();
            })
            .catch(error => {
                const errorMessage = error.body?.message || error.message || '이벤트 저장 중 오류가 발생했습니다.';
                this.showToast('저장 오류', errorMessage, 'error');
            });
    }

    // 이벤트 삭제 - Promise 방식으로 통일
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
                const errorMessage = error.body?.message || error.message || '일정 삭제 중 오류가 발생했습니다.';
                this.showToast('삭제 오류', errorMessage, 'error');
            });
    }

    // 헬퍼 메서드들 - 복잡한 로직을 간결하게 분리
    validateDropData(draggedEl, date) {
        if (!draggedEl || !date) {
            throw new Error('드롭 이벤트 데이터가 유효하지 않습니다.');
        }
        const { recordName, recordType } = draggedEl.dataset;
        if (!recordName || !recordType) {
            throw new Error('드래그된 항목의 데이터가 유효하지 않습니다.');
        }
    }

    extractDropEventData(draggedEl, date) {
        const { recordName, recordType, recordId, accountName } = draggedEl.dataset;
        const localYMD = DateUtils.toLocalYMD(date);
        
        return {
            title: recordName,
            startDate: localYMD,
            endDate: localYMD,
            recordType,
            relatedId: recordId,
            accountName: accountName || ''
        };
    }

    setupNewEvent(eventData) {
        this.recordId = null;
        this.eventTitle = eventData.title;
        this.eventDepartment = this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '';
        this.eventDescription = '';
        this.eventLocation = '';
        this.eventStartDate = eventData.startDate;
        this.eventEndDate = eventData.endDate;

        this.newEventData = {
            extendedProps: {
                recordType: eventData.recordType,
                relatedId: eventData.relatedId,
                accountName: eventData.accountName
            }
        };

        this.costItems = [{ id: 0, type: '', amount: null }];
        this.modalTitle = `새 ${eventData.recordType === 'Personal' ? '활동' : '이벤트'}: ${eventData.title}`;
    }

    setupExistingEvent(result) {
        const evt = result.event;
        
        this.eventTitle = evt.Title__c || '';
        this.eventStartDate = evt.Start_Date__c || '';
        this.eventEndDate = evt.End_Date__c || '';
        this.eventDescription = evt.Description__c || '';
        this.eventLocation = evt.Location__c || '';

        // 부서 설정
        this.eventDepartment = (result.costs && result.costs.length > 0 && result.costs[0].department__c) 
            ? result.costs[0].department__c 
            : (this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '');

        this.newEventData = {
            extendedProps: {
                recordType: evt.Related_Record_Type__c,
                relatedId: evt.Related_Record_Id__c,
                accountName: result.accountName || ''
            }
        };

        this.costItems = (result.costs && result.costs.length > 0)
            ? result.costs.map((c, i) => ({ id: i, type: c.Cost_Type__c, amount: c.Amount__c }))
            : [{ id: 0, type: '', amount: null }];

        this.modalTitle = `이벤트 수정: ${evt.Title__c}`;
    }

    validateEventData() {
        if (!this.eventTitle) {
            this.showToast('입력 오류', '제목은 필수 입력 항목입니다.', 'error');
            return false;
        }

        if (!this.eventDepartment && this.isSalesforceObjectEvent) {
            this.showToast('입력 오류', '부서는 필수 선택 항목입니다.', 'error');
            return false;
        }

        return true;
    }

    buildSaveParams() {
        const validCostItems = this.costItems
            .filter(item => item.type && item.amount && Number(item.amount) > 0)
            .map(item => ({
                type: String(item.type),
                amount: Number(item.amount)
            }));

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

    updateCalendarView(savedEventId) {
        const calendarView = this.template.querySelector('c-calendar-view');
        if (!calendarView) return;

        if (this.recordId) {
            calendarView.updateEvent(this.recordId, {
                title: this.eventTitle,
                start: this.eventStartDate,
                end: DateUtils.addOneDay(this.eventEndDate)
            });
        } else {
            calendarView.addEvent({
                id: savedEventId,
                title: this.eventTitle,
                start: this.eventStartDate,
                end: DateUtils.addOneDay(this.eventEndDate),
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

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}