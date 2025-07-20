/**
 * @description       : 캘린더 컨테이너 (JavaScript 로직 최적화)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Custom Labels
import LABEL_SUCCESS_SAVE from '@salesforce/label/c.LABEL_SUCCESS_SAVE';
import LABEL_SUCCESS_DELETE from '@salesforce/label/c.LABEL_SUCCESS_DELETE';

// Apex Methods
import saveEventAndCosts from '@salesforce/apex/CalendarAppController.saveEventAndCosts';
import getEventDetails from '@salesforce/apex/CalendarAppController.getEventDetails';
import deleteEvent from '@salesforce/apex/CalendarAppController.deleteEvent';
import getDepartmentOptions from '@salesforce/apex/CalendarAppController.getDepartmentOptions';
import getCostTypeOptions from '@salesforce/apex/CalendarAppController.getCostTypeOptions';

const RECORD_TYPES = {
    PERSONAL: 'Personal',
    ACCOUNT: 'Account'
};

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
        return this.departmentPicklistOptions || [];
    }

    get costTypeOptions() {
        return this.costTypePicklistOptions || [];
    }

    // === 라이프사이클 ===
    connectedCallback() {
        this.currentMonthForSummary = new Date().toISOString();
        this.loadPicklistOptions();
    }

    // === 피클리스트 로드 ===
    loadPicklistOptions() {
        Promise.all([getDepartmentOptions(), getCostTypeOptions()])
            .then(([departmentOptions, costTypeOptions]) => {
                this.departmentPicklistOptions = departmentOptions || [];
                this.costTypePicklistOptions = costTypeOptions || [];
            })
            .catch(error => this.showToast('오류', '옵션 로드 실패', 'error'));
    }

    // === 이벤트 드롭 처리 ===
    handleEventDrop(event) {
        try {
            const { draggedEl, date } = event.detail;
            if (!draggedEl?.dataset?.recordName) return;

            const { recordName, recordType, recordId, accountName } = draggedEl.dataset;
            
            this.resetModalData();
            this.eventTitle = recordName;
            this.eventDepartment = this.departmentPicklistOptions[0]?.value || '';
            
            const localYMD = this.toLocalYMD(date);
            this.eventStartDate = localYMD;
            this.eventEndDate = localYMD;

            this.newEventData = {
                extendedProps: { 
                    recordType, 
                    relatedId: recordId || '', 
                    accountName: accountName || '' 
                }
            };

            this.costItems = [{ id: 0, type: '', amount: null }];
            this.modalTitle = `새 ${recordType === RECORD_TYPES.PERSONAL ? '활동' : '이벤트'}: ${recordName}`;
            this.openModal();
        } catch (error) {
            this.showToast('오류', '드롭 처리 실패', 'error');
        }
    }

    // === 기존 이벤트 클릭 처리 ===
    handleEventClick(event) {
        const eventId = event.detail?.eventId;
        if (!eventId) return;

        getEventDetails({ eventId })
            .then(result => {
                if (!result?.event) throw new Error('이벤트 없음');

                const evt = result.event;
                this.recordId = eventId;
                this.eventTitle = evt.Title__c || '';
                this.eventStartDate = evt.Start_Date__c || '';
                this.eventEndDate = evt.End_Date__c || '';
                this.eventDescription = evt.Description__c || '';
                this.eventLocation = evt.Location__c || '';
                
                const costs = result.costs || [];
                this.eventDepartment = costs[0]?.department__c || this.departmentPicklistOptions[0]?.value || '';

                this.newEventData = {
                    extendedProps: {
                        recordType: evt.Related_Record_Type__c || '',
                        relatedId: evt.Related_Record_Id__c || '',
                        accountName: result.accountName || ''
                    }
                };

                this.costItems = costs.length > 0
                    ? costs.map((c, i) => ({ id: i, type: c.Cost_Type__c || '', amount: c.Amount__c || null }))
                    : [{ id: 0, type: '', amount: null }];

                this.modalTitle = `이벤트 수정: ${evt.Title__c || 'Untitled'}`;
                this.openModal();
            })
            .catch(() => this.showToast('오류', '이벤트 로드 실패', 'error'));
    }

    // === 이벤트 저장 ===
    saveEvent() {
        if (!this.eventTitle?.trim()) {
            this.showToast('입력 오류', '제목을 입력해주세요', 'error');
            return;
        }

        const costData = this.costItems
            .filter(item => item?.type && Number(item.amount) > 0)
            .map(item => ({ type: item.type, amount: Number(item.amount) }));

        saveEventAndCosts({
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
            if (savedEventId) {
                this.updateCalendarView(savedEventId);
                this.showToast('성공', '이벤트가 저장되었습니다', 'success');
                this.closeModal();
                this.refreshCostSummary();
            }
        })
        .catch(error => {
            const errorMessage = error?.body?.message || error?.message || '저장 실패';
            this.showToast('저장 오류', errorMessage, 'error');
        });
    }

    // === 이벤트 삭제 ===
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
                const errorMessage = error?.body?.message || error?.message || '삭제 실패';
                this.showToast('삭제 오류', errorMessage, 'error');
            });
    }

    // === 기타 이벤트 핸들러들 ===
    handleEventMoved(event) {
        this.showToast('성공', '이벤트가 이동되었습니다', 'success');
        this.refreshCostSummary();
    }

    handleEventError(event) {
        this.showToast('오류', event.detail?.message || '오류 발생', 'error');
    }

    handleDatesSet(event) {
        const { start, end } = event.detail;
        const startDate = new Date(start);
        const endDate = new Date(end);
        const viewMiddle = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);
        this.currentMonthForSummary = viewMiddle.toISOString();
        this.refreshCostSummary();
    }

    handleInputChange(event) {
        const { name, value } = event.target;
        if (name) this[name] = value || '';
    }

    handleCostChange(event) {
        const { name, value } = event.target;
        const itemId = parseInt(event.target.dataset.id, 10);
        
        if (!isNaN(itemId) && name) {
            this.costItems = this.costItems.map(item =>
                item.id === itemId ? { ...item, [name]: value } : item
            );
        }
    }

    addCostItem() {
        const newId = this.costItems.length;
        this.costItems = [...this.costItems, { id: newId, type: '', amount: null }];
    }

    // === 유틸리티 메서드들 ===
    toLocalYMD(date) {
        try {
            const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
            return localDate.toISOString().slice(0, 10);
        } catch (e) {
            return '';
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
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}