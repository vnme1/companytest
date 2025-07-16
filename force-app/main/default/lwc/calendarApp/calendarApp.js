/**
 * @description       : Calendar App with Drag & Drop functionality
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-16
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
    @track draggedItemTitle = '';

    // 좌측 패널 데이터 로딩
    @wire(getAccountList) wiredAccounts;
    @wire(getContactList) wiredContacts;
    @wire(getOpportunityList) wiredOpportunities;

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
                    AccountName: contact?.Account?.Name || 'N/A'  // Optional chaining 사용
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
                    AccountName: opportunity?.Account?.Name || 'N/A'  // Optional chaining 사용
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
        //record type이 personal이 아니면
        return this.newEventData && this.newEventData.extendedProps && this.newEventData.extendedProps.recordType !== 'Personal';
    }

    // 드래그 드롭 요소가 개인 & 활동 레코드인지 확인
    get isPersonalActivityEvent(){
        return this.newEventData && this.newEventData.extendedProps && this.newEventData.extendedProps.recordType === 'Personal';
    }

    //accoutn명 가져오기
    get displayAccountName() {
        if (this.newEventData && this.newEventData.extendedProps) {
            return this.newEventData.extendedProps.accountName || '';
        }
        return '';
    }

    get costTypeOptions() {
        return [
            { label: '교통비', value: '교통비' },
            { label: '식대', value: '식대' },
            { label: '주유비', value: '주유비' },
            { label: '톨게이트', value: '톨게이트' },
            { label: '교육비', value: '교육비' },
        ];
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
                            allDay: false // 종일 일정이 아니라고 가정
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
                eventClick: this.handleEventClick.bind(this)

            });
            
            this.calendarApi = calendar;
            calendar.render();
            // 처음 로드 시 드래그 기능 적용
            this.initializeExternalDraggables();
        } catch (e) {
            console.error('Error initializing Calendar:', e);
        }
    }

    // PSeo: 탭 전환 시 드래그 기능 적용을 위한 핸들러
    handleTabActive() {
        // LWC 렌더링 사이클을 기다린 후 실행하여 안정성 확보
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
                                relatedId: eventEl.dataset.recordId, // 개인 활동은 ID가 없으므로 null이 됨
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

        // 모달 데이터 초기화
        this.recordId = null;
        this.draggedItemTitle = title;
        this.eventTitle = title;
        
        const startDate = info.date;
        const isoString = new Date(startDate.getTime() - (startDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        
        this.eventStartDate = isoString;
        this.eventEndDate = isoString;
        this.eventDescription = '';
        
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

            // 개별 변수에 직접 값을 할당
            this.eventTitle = result.event.Title__c;
            // ▼▼▼ 날짜 형식을 'YYYY-MM-DDTHH:MM'으로 변환하는 코드 추가 ▼▼▼
            if (result.event.Start_DateTime__c) {
                this.eventStartDate = result.event.Start_DateTime__c.slice(0, 16);
            }
            if (result.event.End_DateTime__c) {
                this.eventEndDate = result.event.End_DateTime__c.slice(0, 16);
            }
            this.eventDescription = result.event.Description__c;
            this.draggedItemTitle = result.event.Title__c;
            
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

    // 비용 추가관련 함수
    addCostItem(){
        const newId = this.costItems.length;
        this.costItems.push({id:newId, type:'',amount:null});
    }
    // 이 함수를 추가하세요
    removeCostItem(event) {
        if (this.costItems.length <= 1) return; // 마지막 한 줄은 삭제 방지
        const itemIdToRemove = parseInt(event.target.dataset.id, 10);
        this.costItems = this.costItems.filter(item => item.id !== itemIdToRemove);
    }
    handleCostChange(event){
        const itemId = parseInt(event.target.dataset.id, 10);
        const fieldName = event.target.name;
        const value = event.target.value;

        this.costItems = this.costItems.map(item => {
        if (item.id === itemId) {
            // id가 일치하는 항목을 찾으면, 해당 속성만 수정한 새 객체를 반환합니다.
            return { ...item, [fieldName]: value };
        }
        // 다른 항목들은 그대로 반환합니다.
        return item;
        });
    }

    async saveEvent() {
        // ▼ try 블록을 함수 최상단으로 이동하여 모든 로직을 감쌉니다.
        try {
            if (!this.eventTitle) {
                this.showToast('입력 오류', '제목은 필수 입력 항목입니다.', 'error');
                return;
            }

            const dataToSave = {
                recordId: this.recordId,
                title: this.eventTitle,
                startDate: this.eventStartDate,
                endDate: this.eventEndDate,
                description: this.eventDescription,
                location: this.eventLocation,
                relatedId: this.newEventData?.extendedProps?.relatedId,
                recordType: this.newEventData?.extendedProps?.recordType,
                costDetailsJson: JSON.stringify(this.costItems)
            };
            //로그
            console.log('데이터 전송');
            console.log(JSON.stringify(dataToSave, null, 2));

            // Apex 호출
            await saveEventAndCosts({ data: dataToSave });

            // 성공 시 로직
            this.showToast('성공', '이벤트가 성공적으로 저장되었습니다.', 'success');
            this.closeModal();
            this.calendarApi.refetchEvents();

        } catch (error) {
            // ▼ 이제 모든 JS 오류와 Apex 오류가 여기서 잡힙니다. ▼
            const errorMessage = error.body ? error.body.message : error.message;
            // 디버깅을 위해 전체 에러를 콘솔에 출력합니다.
            console.error('Save Event Error:', JSON.stringify(error));
            this.showToast('저장 오류', errorMessage, 'error');
        }
    }

    // --- 모달 관련 함수 ---
    openModal() { this.isModalOpen = true; }
    closeModal() {
        this.isModalOpen = false; 
        this.recordId = null;
        this.eventTitle = '';
        this.eventStartDate = '';
        this.eventEndDate = '';
        this.eventDescription = '';
        this.eventLocation = '';
        this.newEventData = { extendedProps: {} };
        this.costItems = [];
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    handleReportClick() {
        // standard__report 대신 standard__webPage 타입으로 직접 URL을 호출해봅니다.
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { // 만든matrix 보고서 url(id)
                url: '/lightning/r/Report/00OSv000003GzhVMAS/view'
            }
        });
    }
}