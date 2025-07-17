/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-17
 * @last modified by  : sejin.park@dkbmc.com
**/
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
    
    get isSalesforceObjectEvent() { return this.newEventData?.extendedProps?.recordType !== 'Personal'; }
    get isPersonalActivityEvent() { return this.newEventData?.extendedProps?.recordType === 'Personal'; }
    get displayAccountName() { return this.newEventData?.extendedProps?.accountName || ''; }
    get departmentOptions() { return this.departmentPicklistOptions; }
    get costTypeOptions() { return this.costTypePicklistOptions; }

    connectedCallback() {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        this.currentMonthForSummary = startOfMonth.toISOString();
        this.loadPicklistOptions();
    }

    async loadPicklistOptions() {
        try {
            this.departmentPicklistOptions = await getDepartmentOptions();
            this.costTypePicklistOptions = await getCostTypeOptions();
        } catch (error) {
            this.showToast('오류', '옵션을 불러오는 데 실패했습니다.', 'error');
        }
    }
    
    handleEventDrop(event) {
        const { draggedEl, date } = event.detail;
        const { recordName, recordType, recordId, accountName } = draggedEl.dataset;

        if (!recordName) return;

        this.recordId = null;
        this.eventTitle = recordName;
        this.eventDepartment = this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '';
        this.eventDescription = '';
        this.eventLocation = '';

        const startDate = date;
        const isoString = new Date(startDate.getTime() - (startDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        this.eventStartDate = isoString;
        this.eventEndDate = isoString;

        this.newEventData = { extendedProps: { recordType, relatedId: recordId, accountName } };
        this.costItems = [{ id: 0, type: '', amount: null }];
        this.modalTitle = `새 ${recordType === 'Personal' ? '활동' : '이벤트'}: ${recordName}`;
        this.openModal();
    }

    async handleEventClick(event) {
        this.recordId = event.detail.eventId;
        if (!this.recordId) return;

        try {
            const result = await getEventDetails({ eventId: this.recordId });
            const evt = result.event;

            this.eventTitle = evt.Title__c;
            this.eventStartDate = evt.Start_DateTime__c ? evt.Start_DateTime__c.slice(0, 16) : '';
            this.eventEndDate = evt.End_DateTime__c ? evt.End_DateTime__c.slice(0, 16) : '';
            this.eventDescription = evt.Description__c;
            this.eventLocation = evt.Location__c;
            this.eventDepartment = result.costs && result.costs.length > 0 ? result.costs[0].department__c : '';
            
            this.costItems = result.costs && result.costs.length > 0 
                ? result.costs.map((c, i) => ({ id: i, type: c.Cost_Type__c, amount: c.Amount__c }))
                : [{ id: 0, type: '', amount: null }];

            this.modalTitle = `이벤트 수정: ${evt.Title__c}`;
            this.openModal();
        } catch (error) {
            this.showToast('오류', '이벤트 정보를 불러오는 데 실패했습니다.', 'error');
        }
    }
    
    handleDatesSet(event) { this.currentMonthForSummary = event.detail.start; }
    
    handleInputChange(event) { this[event.target.name] = event.target.value; }

    handleCostChange(event) {
        const itemId = parseInt(event.target.dataset.id, 10);
        const { name, value } = event.target;
        this.costItems = this.costItems.map(item => item.id === itemId ? { ...item, [name]: value } : item);
    }
    
    addCostItem() { this.costItems = [...this.costItems, { id: this.costItems.length, type: '', amount: null }]; }
    
    removeCostItem(event) {
        if (this.costItems.length <= 1) return;
        const itemIdToRemove = parseInt(event.target.dataset.id, 10);
        this.costItems = this.costItems.filter(item => item.id !== itemIdToRemove);
    }
    
    async saveEvent() {
        if (!this.eventTitle) {
            this.showToast('입력 오류', '제목은 필수 입력 항목입니다.', 'error');
            return;
        }

        try {
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
                costDetailsJson: JSON.stringify(this.costItems)
            };
            
            await saveEventAndCosts(params);
            
            this.showToast('성공', '이벤트가 저장되었습니다.', 'success');
            this.closeModal();
            this.refreshChildComponents();
        } catch (error) {
            this.showToast('저장 오류', error.body.message, 'error');
        }
    }

    async handleDelete() {
        if (!this.recordId) return;
        try {
            await deleteEvent({ eventId: this.recordId });
            this.showToast('성공', '일정이 삭제되었습니다.', 'success');
            this.closeModal();
            this.refreshChildComponents();
        } catch (error) {
            this.showToast('삭제 오류', error.body.message, 'error');
        }
    }

    refreshChildComponents() {
        this.template.querySelector('c-calendar-view')?.refetchEvents();
        this.template.querySelector('c-cost-summary-panel')?.refreshSummary();
    }

    openModal() { this.isModalOpen = true; }

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