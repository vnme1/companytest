/**
 * @description       : 캘린더 컨테이너 메인 컴포넌트
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import saveEventAndCosts from '@salesforce/apex/CalendarAppController.saveEventAndCosts';
import getEventDetails from '@salesforce/apex/CalendarAppController.getEventDetails';
import deleteEvent from '@salesforce/apex/CalendarAppController.deleteEvent';
import getDepartmentOptions from '@salesforce/apex/CalendarAppController.getDepartmentOptions';
import getCostTypeOptions from '@salesforce/apex/CalendarAppController.getCostTypeOptions';

function addOneDay(ymdStr) {
    const date = new Date(ymdStr);
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
}

export default class CalendarContainer extends LightningElement {
    @track isModalOpen = false;
    @track modalTitle = '';
    @track currentMonthForSummary;

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
            this.showToast('오류', '옵션을 불러오는 데 실패했습니다.', 'error');
        }
    }

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

            const startDate = date;
            const localYMD = new Date(startDate.getTime() - (startDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
            this.eventStartDate = localYMD;
            this.eventEndDate = localYMD;

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
            this.showToast('오류', error.message || '드래그 앤 드롭 처리 중 오류가 발생했습니다.', 'error');
        }
    }

    async handleEventClick(event) {
        this.recordId = event.detail.eventId;
        if (!this.recordId) return;

        try {
            const result = await getEventDetails({ eventId: this.recordId });
            const evt = result.event;

            this.eventTitle = evt.Title__c || '';
            this.eventStartDate = evt.Start_Date__c || '';
            this.eventEndDate = evt.End_Date__c || '';
            this.eventDescription = evt.Description__c || '';
            this.eventLocation = evt.Location__c || '';

            if (result.costs && result.costs.length > 0 && result.costs[0].department__c) {
                this.eventDepartment = result.costs[0].department__c;
            } else {
                this.eventDepartment = this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '';
            }

            this.newEventData = {
                extendedProps: {
                    recordType: evt.Related_Record_Type__c,
                    relatedId: evt.Related_Record_Id__c,
                    accountName: result.accountName || ''
                }
            };

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
            this.showToast('오류', '이벤트 정보를 불러오는 데 실패했습니다.', 'error');
        }
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

    async saveEvent() {
        if (!this.eventTitle) {
            this.showToast('입력 오류', '제목은 필수 입력 항목입니다.', 'error');
            return;
        }

        if (!this.eventDepartment && this.isSalesforceObjectEvent) {
            this.showToast('입력 오류', '부서는 필수 선택 항목입니다.', 'error');
            return;
        }

        try {
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

            const calendarView = this.template.querySelector('c-calendar-view');
            if (calendarView) {
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

            this.showToast('성공', '이벤트가 저장되었습니다.', 'success');
            this.closeModal();
            this.refreshCostSummary();

        } catch (error) {
            const errorMessage = error.body?.message || error.message || '이벤트 저장 중 오류가 발생했습니다.';
            this.showToast('저장 오류', errorMessage, 'error');
        }
    }

    async handleDelete() {
        if (!this.recordId) return;

        try {
            await deleteEvent({ eventId: this.recordId });

            const calendarView = this.template.querySelector('c-calendar-view');
            if (calendarView) {
                calendarView.removeEvent(this.recordId);
            }

            this.showToast('성공', '일정이 삭제되었습니다.', 'success');
            this.closeModal();
            this.refreshCostSummary();

        } catch (error) {
            const errorMessage = error.body?.message || error.message || '일정 삭제 중 오류가 발생했습니다.';
            this.showToast('삭제 오류', errorMessage, 'error');
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