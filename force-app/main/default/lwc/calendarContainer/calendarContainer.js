/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-22
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// apex 메소드
import saveEventAndCosts from '@salesforce/apex/CalendarAppController.saveEventAndCosts';
import getEventDetails from '@salesforce/apex/CalendarAppController.getEventDetails';
import deleteEvent from '@salesforce/apex/CalendarAppController.deleteEvent';
import getDepartmentOptions from '@salesforce/apex/CalendarAppController.getDepartmentOptions';
import getCostTypeOptions from '@salesforce/apex/CalendarAppController.getCostTypeOptions';

export default class CalendarContainer extends LightningElement {
    @track isModalOpen = false;
    @track modalTitle = '';
    @track currentMonthForSummary = new Date().toISOString();
    @track recordId = null;
    @track eventTitle = '';
    @track eventStartDate = '';
    @track eventEndDate = '';
    @track eventDescription = '';
    @track eventLocation = '';
    @track eventDepartment = '';
    @track costItems = [{ id: 0, type: '', amount: null }];
    @track newEventData = { extendedProps: {} };

    @track departmentPicklistOptions = [];
    @track costTypePicklistOptions = [];

    get isSalesforceObjectEvent() {
        return this.newEventData?.extendedProps?.recordType !== 'Personal';
    }

    get isPersonalActivityEvent() {
        return !this.isSalesforceObjectEvent;
    }

    get displayAccountName() {
        return this.newEventData?.extendedProps?.accountName || '';
    }

    get departmentOptions() { return this.departmentPicklistOptions || []; }
    get costTypeOptions() { return this.costTypePicklistOptions || []; }


    get isAccountType() {
    return this.newEventData?.extendedProps?.recordType === 'Account';
    }

    get isContactType() {
        return this.newEventData?.extendedProps?.recordType === 'Contact';
    }

    get isOpportunityType() {
        return this.newEventData?.extendedProps?.recordType === 'Opportunity';
    }

    get displayRelatedRecord() {
        const recordType = this.newEventData?.extendedProps?.recordType;
        
        if (recordType === 'Account') {
            return this.newEventData?.extendedProps?.accountName || '';
        } else if (recordType === 'Contact') {
            return this.newEventData?.extendedProps?.contactName || '';
        } else if (recordType === 'Opportunity') {
            return this.newEventData?.extendedProps?.opportunityName || '';
        }
        
        return '';
    }

    connectedCallback() { //컴포넌트가 DOM 연결시 자동 실행
        Promise.all([getDepartmentOptions(), getCostTypeOptions()])
            .then(([dept, cost]) => {
                this.departmentPicklistOptions = dept || [];
                this.costTypePicklistOptions = cost || [];
            })
            .catch(error => {
                console.error('부서/비용 옵션 조회 오류:', error);
                this.showToast('오류', '설정 옵션을 불러오는데 실패했습니다.', 'error');
            });
    }

    handleEventDrop(event) {
        const { draggedEl, date } = event.detail;
        const { recordName, recordType, recordId, accountName } = draggedEl?.dataset || {};
        
        if (!recordName) return; // 필수 데이터 없을시 종료

        this.resetModal();
        this.eventTitle = recordName;
        this.eventDepartment = this.departmentPicklistOptions[0]?.value || '';
        this.eventStartDate = this.eventEndDate = this.toLocalYMD(date);
        
        // 사용하지 않는 변수 제거됨
        this.newEventData = { // 이벤트 메타 데이터 설정
            extendedProps: { 
                recordType, 
                relatedId: recordId || '', 
                accountName: recordType === 'Account' ? recordName : (accountName || ''),
                contactName: recordType === 'Contact' ? recordName : '',
                opportunityName: recordType === 'Opportunity' ? recordName : ''
            }
        };
        this.modalTitle = `새 ${recordType === 'Personal' ? '활동' : '이벤트'}: ${recordName}`;
        this.openModal();
    }

    handleEventClick(event) {
        const eventId = event.detail?.eventId;
        if (!eventId) return;

        getEventDetails({ eventId }) // apex 메소트 호출(이벤트 상세 정보 조회)
            .then(result => {
                const evt = result.event;
                const costs = result.costs || [];
                
                this.recordId = eventId;
                this.eventTitle = evt.Title__c || '';
                this.eventStartDate = evt.Start_Date__c || '';
                this.eventEndDate = evt.End_Date__c || '';
                this.eventDescription = evt.Description__c || '';
                this.eventLocation = evt.Location__c || '';
                this.eventDepartment = costs[0]?.department__c || this.departmentPicklistOptions[0]?.value || '';

                // 레코드 타입별로 관련 레코드 이름 설정
                const recordType = evt.Related_Record_Type__c || '';
                const relatedRecordName = result.relatedRecordName || '';
                
                this.newEventData = {
                    extendedProps: {
                        recordType: recordType,
                        relatedId: evt.Related_Record_Id__c || '',
                        accountName: recordType === 'Account' ? relatedRecordName : '',
                        contactName: recordType === 'Contact' ? relatedRecordName : '',
                        opportunityName: recordType === 'Opportunity' ? relatedRecordName : ''
                    }
                };

                if (costs.length > 0) {
                    this.costItems = costs.map((c, i) => ({
                        id: i,
                        type: c.Cost_Type__c || '',
                        amount: c.Amount__c || null
                    }));
                } else {
                    this.costItems = [{ id: 0, type: '', amount: null }];
                }

                this.modalTitle = `이벤트 수정: ${evt.Title__c || 'Untitled'}`;
                this.openModal();
            })
            .catch(error => {
                console.error('이벤트 상세 조회 오류:', error);
                this.showToast('오류', '이벤트 정보를 불러오는데 실패했습니다.', 'error');
            });
    }

    saveEvent() {
        if (!this.eventTitle?.trim()) {
            return this.showToast('입력 오류', '제목을 입력해주세요', 'error');
        }

        const costData = this.costItems
            .filter(item => item?.type && Number(item.amount) > 0)
            .map(item => ({ type: item.type, amount: Number(item.amount) }));

        return saveEventAndCosts({
            recordId: this.recordId,
            title: this.eventTitle,
            startDate: this.eventStartDate,
            endDate: this.eventEndDate,
            description: this.eventDescription,
            location: this.eventLocation,
            department: this.eventDepartment,
            relatedId: this.newEventData?.extendedProps?.relatedId || '',
            recordType: this.newEventData?.extendedProps?.recordType || '',
            costDetailsJson: JSON.stringify(costData)
        })
        .then(savedEventId => {
            this.updateCalendarView(savedEventId);
            this.showToast('성공', '저장되었습니다', 'success');
            this.closeModal();
            this.refreshCostSummary();
        })
        .catch(error => {
            const msg = error?.body?.message || error?.message || '저장 실패';
            this.showToast('저장 오류', msg, 'error');
        });
    }

    handleDelete() {
        if (!this.recordId) return;

        deleteEvent({ eventId: this.recordId })
            .then(() => {
                this.template.querySelector('c-calendar-view')?.removeEvent(this.recordId);
                this.showToast('성공', '삭제되었습니다', 'success');
                this.closeModal();
                this.refreshCostSummary();
            })
            .catch(error => {
                const msg = error?.body?.message || error?.message || '삭제 실패';
                this.showToast('삭제 오류', msg, 'error');
            });
    }

    handleEventMoved() {
        this.showToast('성공', '이벤트가 이동되었습니다', 'success');
        this.refreshCostSummary();
    }

    handleEventError(event) {
        this.showToast('오류', event.detail?.message || '오류 발생', 'error');
    }

    handleDatesSet(event) {
        const { start, end } = event.detail;
        const mid = new Date((new Date(start).getTime() + new Date(end).getTime()) / 2);
        this.currentMonthForSummary = mid.toISOString();
        this.refreshCostSummary();
    }

    handleInputChange(event) {
        const { name, value } = event.target;
        if (name) {
            this[name] = value || '';
        }
    }

    handleCostChange(event) {
        const { name, value } = event.target;
        const itemId = parseInt(event.target.dataset.id, 10);
        
        if (!isNaN(itemId) && name) {
            this.costItems = this.costItems.map(item =>
                (item.id === itemId ? { ...item, [name]: value } : item)
            );
        }
    }

    addCostItem() {
        this.costItems = [...this.costItems, { 
            id: this.costItems.length, 
            type: '', 
            amount: null 
        }];
    }

    toLocalYMD(date) {
        try {
            return new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
                .toISOString().slice(0, 10);
        } catch (e) {
            return '';
        }
    }

    updateCalendarView(savedEventId) {
        const calendarView = this.template.querySelector('c-calendar-view');
        if (!calendarView) return;

        const eventData = {
            title: this.eventTitle || 'Untitled Event',
            start: this.eventStartDate || '',
            end: this.addOneDay(this.eventEndDate || this.eventStartDate || ''),
            allDay: true
        };

        if (this.recordId) {
            calendarView.updateEvent(this.recordId, eventData);
        } else if (savedEventId) {
            calendarView.addEvent({ id: savedEventId, ...eventData });
        }
    }

    addOneDay(ymdStr) {
        try {
            const date = new Date(ymdStr);
            date.setDate(date.getDate() + 1);
            return date.toISOString().slice(0, 10);
        } catch (e) {
            return ymdStr;
        }
    }

    refreshCostSummary() {
        const panel = this.template.querySelector('c-cost-summary-panel');
        if (panel) {
            panel.updateMonth(this.currentMonthForSummary);
            panel.refreshSummary();
        }
    }

    openModal() { 
        this.isModalOpen = true; 
    }
    
    closeModal() {
        this.isModalOpen = false;
        this.resetModal();
    }

    resetModal() {
        this.recordId = null;
        this.eventTitle = '';
        this.eventStartDate = '';
        this.eventEndDate = '';
        this.eventDescription = '';
        this.eventLocation = '';
        this.eventDepartment = '';
        this.costItems = [{ id: 0, type: '', amount: null }];
        this.newEventData = { extendedProps: {} };
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}