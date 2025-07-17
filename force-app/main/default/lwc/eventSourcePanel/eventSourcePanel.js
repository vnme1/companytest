/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-17
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, wire } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';

import getAccountList from '@salesforce/apex/CalendarAppController.getAccountList';
import getContactList from '@salesforce/apex/CalendarAppController.getContactList';
import getOpportunityList from '@salesforce/apex/CalendarAppController.getOpportunityList';

export default class EventSourcePanel extends LightningElement {
    fullCalendarInitialized = false;

    @wire(getAccountList) wiredAccounts;
    @wire(getContactList) wiredContacts;
    @wire(getOpportunityList) wiredOpportunities;

    get accountData() { return this.wiredAccounts.data || []; }
    get contactData() { return this.wiredContacts.data || []; }
    get opportunityData() { return this.wiredOpportunities.data || []; }
    
    renderedCallback() {
        if (this.fullCalendarInitialized) {
            return;
        }
        
        loadScript(this, FullCalendar + '/main.min.js')
            .then(() => {
                this.fullCalendarInitialized = true;
                this.initializeExternalDraggables();
            })
            .catch(error => { console.error('Error loading FullCalendar:', error); });
    }

    handleTabActive() {
        Promise.resolve().then(() => {
            this.initializeExternalDraggables();
        });
    }
    
    initializeExternalDraggables() {
        if (!this.fullCalendarInitialized || !window.FullCalendar) {
            return;
        }

        const draggableContainers = this.template.querySelectorAll('.salesforce-components-section, .personal-activity-section');
        
        draggableContainers.forEach(container => {
            if (container.dataset.draggableInitialized) return;

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
        });
    }
}