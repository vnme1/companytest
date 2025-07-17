/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-17
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, wire, track } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';
import { NavigationMixin } from 'lightning/navigation';

import getAccountList from '@salesforce/apex/CalendarAppController.getAccountList';
import getContactList from '@salesforce/apex/CalendarAppController.getContactList';
import getOpportunityList from '@salesforce/apex/CalendarAppController.getOpportunityList';

import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getEventDetails from '@salesforce/apex/CalendarAppController.getEventDetails';
import saveEventAndCosts from '@salesforce/apex/CalendarAppController.saveEventAndCosts';
import getEvents from '@salesforce/apex/CalendarAppController.getEvents';
import getMonthlyCostSummary from '@salesforce/apex/CalendarAppController.getMonthlyCostSummary';
import updateEventDates from '@salesforce/apex/CalendarAppController.updateEventDates';
import deleteEvent from '@salesforce/apex/CalendarAppController.deleteEvent';

// 동적 Picklist import
import getDepartmentOptions from '@salesforce/apex/CalendarAppController.getDepartmentOptions';
import getCostTypeOptions from '@salesforce/apex/CalendarAppController.getCostTypeOptions';

const accountColumns = [
    { label: 'Account Name', fieldName: 'Name', type: 'text' },
    { label: 'Owner Name', fieldName: 'OwnerName', type: 'text' },
];
const contactColumns = [
    { label: 'Name', fieldName: 'Name', type: 'text' },
    { label: 'Account Name', fieldName: 'AccountName', type: 'text' },
];
const opportunityColumns = [
    { label: 'Name', fieldName: 'Name', type: 'text' },
    { label: 'Stage', fieldName: 'StageName', type: 'text' },
];

export default class CalendarApp extends NavigationMixin(LightningElement) {
    fullCalendarInitialized = false;
    calendarApi; // FullCalendar API 저장용
    
    // Apex 연결 sales object
    accountColumns = accountColumns;
    contactColumns = contactColumns;
    opportunityColumns = opportunityColumns;
    
    recordId = null;
    @track newEventData = { extendedProps: {} };
    @track costItems = [];

    // 모달 관련 변수 
    isModalOpen = false;              
    modalTitle = "";                  

    // 모달 입력 필드와 직접 바인딩될 변수들
    @track eventTitle = '';
    @track eventStartDate = '';
    @track eventEndDate = '';
    @track eventDescription = '';
    @track eventLocation  = '';
    @track eventDepartment = '';
    @track draggedItemTitle = '';
    
    // 비용 합계 데이터
    @track costSummaryData = {};

    // 동적 Picklist 데이터
    @track departmentPicklistOptions = [];
    @track costTypePicklistOptions = [];

    // 좌측 패널 데이터 로딩
    @wire(getAccountList) wiredAccounts;
    @wire(getContactList) wiredContacts;
    @wire(getOpportunityList) wiredOpportunities;

    // 동적 Picklist 데이터 로딩
    @wire(getDepartmentOptions) 
    wiredDepartmentOptions({ error, data }) {
        if (data) {
            this.departmentPicklistOptions = data;
            console.log('Department options loaded:', data);
        } else if (error) {
            console.error('Error loading department options:', error);
            // fallback options
            this.departmentPicklistOptions = [
                { label: '개발부', value: '개발부' },
                { label: '영업부', value: '영업부' },
                { label: '마케팅부', value: '마케팅부' }
            ];
        }
    }

    @wire(getCostTypeOptions)
    wiredCostTypeOptions({ error, data }) {
        if (data) {
            this.costTypePicklistOptions = data;
            console.log('Cost type options loaded:', data);
        } else if (error) {
            console.error('Error loading cost type options:', error);
            // fallback options
            this.costTypePicklistOptions = [
                { label: '교통비', value: '교통비' },
                { label: '식대', value: '식대' },
                { label: '주유비', value: '주유비' },
                { label: '톨게이트', value: '톨게이트' },
                { label: '교육비', value: '교육비' }
            ];
        }
    }

    // Account 데이터 연결
    get accountData() {
        if (this.wiredAccounts.data) {
            return this.wiredAccounts.data.map(account => ({
                ...account,
                OwnerName: account.Owner ? account.Owner.Name : 'N/A'
            }));
        }
        return [];
    }

    // Contact 데이터 연결
    get contactData() {
        try {
            if (this.wiredContacts.data && Array.isArray(this.wiredContacts.data)) {
                return this.wiredContacts.data.map(contact => ({
                    ...contact,
                    AccountName: contact?.Account?.Name || 'N/A'
                }));
            }
            return [];
        } catch (e) {
            console.error('Error processing contact data:', e);
            return [];
        }
    }

    // Opportunity 데이터 연결
    get opportunityData() {
        try {
            if (this.wiredOpportunities.data && Array.isArray(this.wiredOpportunities.data)) {
                return this.wiredOpportunities.data.map(opportunity => ({
                    ...opportunity,
                    AccountName: opportunity?.Account?.Name || 'N/A'
                }));
            }
            return [];
        } catch (e) {
            console.error('Error processing opportunity data:', e);
            return [];
        }
    }

    // 드래그 드롭 요소가 salesforce 오브젝트 레코드인지 확인
    get isSalesforceObjectEvent(){
        return this.newEventData && this.newEventData.extendedProps && this.newEventData.extendedProps.recordType !== 'Personal';
    }

    // 드래그 드롭 요소가 개인 & 활동 레코드인지 확인
    get isPersonalActivityEvent(){
        return this.newEventData && this.newEventData.extendedProps && this.newEventData.extendedProps.recordType === 'Personal';
    }

    // account명 가져오기
    get displayAccountName() {
        if (this.newEventData && this.newEventData.extendedProps) {
            return this.newEventData.extendedProps.accountName || '';
        }
        return '';
    }

    // 동적 Picklist 옵션들
    get departmentOptions() {
        return this.departmentPicklistOptions;
    }

    get costTypeOptions() {
        return this.costTypePicklistOptions;
    }

    // 비용 합계 표시를 위한 getter
    get costSummaryItems() {
        if (!this.costSummaryData) return [];
        
        return Object.keys(this.costSummaryData)
            .filter(key => key !== '총계')
            .map(key => ({
                key: key,
                label: key,
                amount: this.costSummaryData[key] || 0
            }));
    }

    // 총계 금액을 위한 getter
    get totalCostAmount() {
        return this.costSummaryData?.총계 || 0;
    }

    // 컴포넌트가 렌더링된 후 FullCalendar 라이브러리 로드
    async renderedCallback() {
        if (this.fullCalendarInitialized) { return; }
        this.fullCalendarInitialized = true;

        try {
            await Promise.all([
                loadStyle(this, FullCalendar + '/main.min.css'),
                loadScript(this, FullCalendar + '/main.min.js'),
            ]);
            await loadScript(this, FullCalendar + '/locales/ko.js');
            this.initializeCalendar();
        } catch (e) {
            console.error('Error loading FullCalendar:', e);
        }
    }
    
    // FullCalendar 초기화
    initializeCalendar() {
        try {
            const calendarEl = this.template.querySelector('.calendar-container');
            if (!window.FullCalendar || !calendarEl) { return; }

            const calendar = new window.FullCalendar.Calendar(calendarEl, {
                headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
                locale: 'ko',
                initialView: 'dayGridMonth',
                editable: true,
                droppable: true,
                expandRows: true, 
                events: (fetchInfo, successCallback, failureCallback) => {
                    getEvents({
                        startStr: fetchInfo.start.toISOString(),
                        endStr: fetchInfo.end.toISOString()
                    })
                    .then(result => {
                        const events = result.map(event => ({
                            id: event.Id,
                            title: event.Title__c,
                            start: event.Start_DateTime__c,
                            end: event.End_DateTime__c,
                            allDay: false
                        }));
                        successCallback(events);
                    })
                    .catch(error => {
                        console.error('Error fetching events:', error);
                        failureCallback(error);
                    });
                },
                drop: this.handleDrop.bind(this),
                eventReceive: (info) => { info.event.remove(); },
                eventClick: this.handleEventClick.bind(this),
                eventDrop: this.handleEventDrop.bind(this),
                datesSet: () => {
                    this.updateCostSummary();
                }
            });
            
            this.calendarApi = calendar;
            calendar.render();
            
            this.updateCostSummary();
            this.initializeExternalDraggables();
        } catch (e) {
            console.error('Error initializing Calendar:', e);
        }
    }

    // 드래그앤드롭으로 일정 이동 시 처리
    async handleEventDrop(info) {
        try {
            const eventId = info.event.id;
            const newStart = info.event.start.toISOString().slice(0, 16);
            const newEnd = info.event.end ? info.event.end.toISOString().slice(0, 16) : newStart;
            
            await updateEventDates({
                eventId: eventId,
                newStartDate: newStart,
                newEndDate: newEnd
            });
            
            this.showToast('성공', '일정이 성공적으로 이동되었습니다.', 'success');
            
        } catch (error) {
            console.error('Error updating event dates:', error);
            this.showToast('오류', '일정 이동 중 오류가 발생했습니다.', 'error');
            
            // 오류 발생 시 원래 위치로 되돌리기
            info.revert();
        }
    }

    // 탭 전환 시 드래그 기능 적용을 위한 핸들러
    handleTabActive() {
        Promise.resolve().then(() => {
            this.initializeExternalDraggables();
        });
    }

    initializeExternalDraggables() {
        try {
            // Salesforce 구성요소 컨테이너
            const salesforceContainer = this.template.querySelector('.salesforce-components-section');
            if (salesforceContainer && !salesforceContainer.classList.contains('fc-draggable-initialized')) {
                // eslint-disable-next-line no-new
                new window.FullCalendar.Draggable(salesforceContainer, {
                    itemSelector: '.table-row',
                    eventData: function(eventEl) {
                        return {
                            title: eventEl.dataset.recordName,
                            extendedProps: {
                                relatedId: eventEl.dataset.recordId,
                                recordType: eventEl.dataset.recordType,
                                accountName: eventEl.dataset.accountName || ''
                            }
                        };
                    }
                });
                salesforceContainer.classList.add('fc-draggable-initialized');
            }

            // 개인 & 활동 컨테이너
            const activityContainer = this.template.querySelector('.personal-activity-section');
            if (activityContainer && !activityContainer.classList.contains('fc-draggable-initialized')) {
                // eslint-disable-next-line no-new
                new window.FullCalendar.Draggable(activityContainer, {
                    itemSelector: '.activity-item',
                    eventData: function(eventEl) {
                        return {
                            title: eventEl.dataset.recordName,
                            extendedProps: {
                                relatedId: eventEl.dataset.recordId,
                                recordType: eventEl.dataset.recordType
                            }
                        };
                    }
                });
                activityContainer.classList.add('fc-draggable-initialized');
            }
        } catch(e) {
            console.error('Error initializing draggables:', e);
        }
    }

    handleDrop(info) {
        const draggedEl = info.draggedEl;
        const title = draggedEl.dataset.recordName;
        const recordType = draggedEl.dataset.recordType;
        const relatedId = draggedEl.dataset.recordId;

        if (!title) { return; }

        this.recordId = null;
        this.draggedItemTitle = title;
        this.eventTitle = title;
        
        // 첫 번째 부서 옵션을 기본값으로 설정
        this.eventDepartment = this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '';
        
        const startDate = info.date;
        const isoString = new Date(startDate.getTime() - (startDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        
        this.eventStartDate = isoString;
        this.eventEndDate = isoString;
        this.eventDescription = '';
        this.eventLocation = '';
        
        this.newEventData = {
            extendedProps: {
                recordType: recordType,
                relatedId: relatedId,
                accountName: draggedEl.dataset.accountName || ''
            }
        };

        this.costItems = [{id: 0, type: '', amount: null}];
        this.modalTitle = `새 ${recordType === 'Personal' ? '활동' : '이벤트'}: ${title}`;
        this.openModal();
    }
    
    // 일정 클릭시 수정 모달창
    async handleEventClick(info) {
        if (!info.event.id) {
            return;
        }

        this.recordId = info.event.id;

        try {
            const result = await getEventDetails({ eventId: this.recordId });

            this.eventTitle = result.event.Title__c;
            if (result.event.Start_DateTime__c) {
                this.eventStartDate = result.event.Start_DateTime__c.slice(0, 16);
            }
            if (result.event.End_DateTime__c) {
                this.eventEndDate = result.event.End_DateTime__c.slice(0, 16);
            }
            this.eventDescription = result.event.Description__c;
            this.eventLocation = result.event.Location__c;
            this.draggedItemTitle = result.event.Title__c;
            
            // 부서 정보 로딩 (첫 번째 Cost Detail의 부서 정보 사용)
            if (result.costs && result.costs.length > 0 && result.costs[0].department__c) {
                this.eventDepartment = result.costs[0].department__c;
            } else {
                this.eventDepartment = this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '';
            }
            
            this.newEventData = {
                extendedProps: {
                    recordType: result.event.Related_Record_Type__c,
                    relatedId: result.event.Related_Record_Id__c,
                    accountName: result.accountName || ''
                }
            };
            
            if (result.costs && result.costs.length > 0) {
                this.costItems = result.costs.map((cost, index) => ({
                    id: index,
                    type: cost.Cost_Type__c,
                    amount: cost.Amount__c
                }));
            } else {
                this.costItems = [{ id: 0, type: '', amount: null }];
            }

            this.modalTitle = `이벤트 수정: ${result.event.Title__c}`;
            this.openModal();

        } catch (error) {
            this.showToast('오류', '이벤트 데이터를 불러오는 중 오류가 발생했습니다.', 'error');
        }
    }

    // 모달 입력 필드 변경 핸들러
    handleInputChange(event) {
        this[event.target.name] = event.target.value;
    }

    // 현재 월의 비용 합계를 가져오는 함수
    async updateCostSummary() {
        try {
            const currentDate = this.calendarApi.getDate();
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            
            const startOfMonth = new Date(year, month, 1);
            const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

            const result = await getMonthlyCostSummary({
                startDate: startOfMonth.toISOString(),
                endDate: endOfMonth.toISOString()
            });

            // 동적으로 비용 합계 데이터 구성
            let totalAmount = 0;
            const summaryData = {};
            
            // 모든 비용 타입에 대해 합계 설정
            for (const [costType, amount] of Object.entries(result)) {
                summaryData[costType] = amount || 0;
                totalAmount += (amount || 0);
            }
            
            // 총계 추가
            summaryData['총계'] = totalAmount;
            
            this.costSummaryData = summaryData;

        } catch (error) {
            console.error('비용 합계 조회 오류:', error);
            this.costSummaryData = {
                '총계': 0
            };
        }
    }

    // 비용 추가 함수
    addCostItem(){
        const newId = this.costItems.length;
        this.costItems.push({id:newId, type:'',amount:null});
    }

    // 비용 제거 함수
    removeCostItem(event) {
        if (this.costItems.length <= 1) return;
        const itemIdToRemove = parseInt(event.target.dataset.id, 10);
        this.costItems = this.costItems.filter(item => item.id !== itemIdToRemove);
    }

    handleCostChange(event){
        const itemId = parseInt(event.target.dataset.id, 10);
        const fieldName = event.target.name;
        const value = event.target.value;

        this.costItems = this.costItems.map(item => {
            if (item.id === itemId) {
                return { ...item, [fieldName]: value };
            }
            return item;
        });
    }

    async saveEvent() {
        try {
            if (!this.eventTitle) {
                this.showToast('입력 오류', '제목은 필수 입력 항목입니다.', 'error');
                return;
            }

            // 부서 필드 유효성 검사 추가
            if (!this.eventDepartment && this.isSalesforceObjectEvent) {
                this.showToast('입력 오류', '부서는 필수 선택 항목입니다.', 'error');
                return;
            }

            const cleanedCostItems = this.costItems
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
                costDetailsJson: JSON.stringify(cleanedCostItems)
            };

            console.log('데이터 전송');
            console.log(JSON.stringify(params, null, 2));

            const savedEventId = await saveEventAndCosts(params);

            // 캘린더 이벤트 즉시 추가/업데이트
            if (this.recordId) {
                const existingEvent = this.calendarApi.getEventById(this.recordId);
                if (existingEvent) {
                    existingEvent.setProp('title', this.eventTitle);
                    existingEvent.setStart(this.eventStartDate);
                    existingEvent.setEnd(this.eventEndDate);
                }
            } else {
                this.calendarApi.addEvent({
                    id: savedEventId,
                    title: this.eventTitle,
                    start: this.eventStartDate,
                    end: this.eventEndDate,
                    allDay: false
                });
            }

            // 우측 패널 비용 합계 업데이트
            this.updateCostSummary();

            // 성공 시 로직
            this.showToast('성공', '이벤트가 성공적으로 저장되었습니다.', 'success');
            this.closeModal();

        } catch (error) {
            const errorMessage = error.body ? error.body.message : error.message;
            console.error('Save Event Error:', JSON.stringify(error));
            this.showToast('저장 오류', errorMessage, 'error');
        }
    }

    // 일정 삭제 함수
    async deleteEvent() {
        try {
            if (!this.recordId) {
                this.showToast('오류', '삭제할 일정을 찾을 수 없습니다.', 'error');
                return;
            }

            await deleteEvent({ eventId: this.recordId });
            
            // 캘린더에서 이벤트 제거
            const eventToRemove = this.calendarApi.getEventById(this.recordId);
            if (eventToRemove) {
                eventToRemove.remove();
            }
            
            // 비용 합계 업데이트
            this.updateCostSummary();
            
            this.showToast('성공', '일정이 성공적으로 삭제되었습니다.', 'success');
            this.closeModal();
            
        } catch (error) {
            console.error('Error deleting event:', error);
            this.showToast('오류', '일정 삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    // 모달 관련 함수
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
        this.newEventData = { extendedProps: {} };
        this.costItems = [];
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    handleReportClick() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/lightning/r/Report/00OAu000005iY1WMAU/view'
            }
        });
    }
}