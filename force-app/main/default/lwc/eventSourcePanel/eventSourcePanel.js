/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-17
 * @last modified by  : sejin.park@dkbmc.com
**/
/**
 *  * Project: Salesforce Development
 *  * Author: sejin.park@dkbmc.com
 *  * Description: JavaScript 기능 구현
 *  * License: Custom
 */

import { LightningElement, wire } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new'; // Draggable을 위해 필요

import getAccountList from '@salesforce/apex/CalendarAppController.getAccountList';
import getContactList from '@salesforce/apex/CalendarAppController.getContactList';
import getOpportunityList from '@salesforce/apex/CalendarAppController.getOpportunityList';


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

export default class EventSourcePanel extends LightningElement {

    fullCalendarInitialized = false;

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

    // FullCalendar 스크립트가 로드된 후에 Draggable 초기화
    renderedCallback() {
        if (this.fullCalendarInitialized) {
            return;
        }
        
        loadScript(this, FullCalendar + '/main.min.js')
            .then(() => {
                this.fullCalendarInitialized = true;
                this.initializeExternalDraggables();
            })
            .catch(error => {
                console.error('Error loading FullCalendar:', error);
            });
    }

    // 탭 전환 시 드래그 기능 재적용
    handleTabActive() {
        // LWC 렌더링 사이클을 기다린 후 실행
        Promise.resolve().then(() => {
            this.initializeExternalDraggables();
        });
    }
    
    // 드래그 기능 초기화
    initializeExternalDraggables() {
        if (!this.fullCalendarInitialized || !window.FullCalendar) {
            return;
        }

        const draggableContainers = this.template.querySelectorAll('.salesforce-components-section, .personal-activity-section');
        
        draggableContainers.forEach(container => {
            if (!container.dataset.draggableInitialized) {
                new window.FullCalendar.Draggable(container, {
                    itemSelector: '.table-row, .activity-item',
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
                container.dataset.draggableInitialized = 'true';
            }
        });
    }

}