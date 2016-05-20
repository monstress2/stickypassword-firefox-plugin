
//*****************************************************************************}
//                                                                             }
//       Sticky Password Autofill Engine                                       }
//       Mozilla Main module                                                   }
//                                                                             }
//       Copyright (C) 2016 StickyPassword.com                                 }
//                                                                             }
//*****************************************************************************}
var self = require('sdk/self');
var pageWorker = require('sdk/page-worker');
var pageMod = require('sdk/page-mod');
var windows = require('sdk/windows');
var tabs = require('sdk/tabs');
var notifications = require('sdk/notifications');
var simpleStorage = require('sdk/simple-storage');
var system = require('sdk/system');
var l10n = require('sdk/l10n');

var spLog = require('./spLog').spLog;
spLog.setProductName('spMain');
var spActionButton = require('./spActionButton');
var spPasswordManagerConnector = require('./spPasswordManagerConnector').spPasswordManagerConnector;



// Unit functions --------------------------------------------------------------

function spSameText(AStr1, AStr2)
{
  try
  {
    var Str1 = AStr1 ? AStr1.toLowerCase() : '';
    var Str2 = AStr2 ? AStr2.toLowerCase() : '';    
    return Str1 === Str2;
  }
  catch (ErrorMessage)
  {
    return false;
  }
}



// TspMessageCache -------------------------------------------------------------

function TspMessageCache(AMessageRTID, AMessage)
{
  this.MessageRTID = AMessageRTID;
  this.Message = AMessage;
}



// TspMessageCacheManager ------------------------------------------------------

function TspMessageCacheManager()
{
  this.Log = {
    // log modes
    Info: false
  };

  this.Cache = new Array();
}

TspMessageCacheManager.prototype._InfexOf = function (AMessageRTID)
{
  if (AMessageRTID)
  try
  {
    for (var i = 0, len = this.Cache.length; i < len; i++)
    {
      var item = this.Cache[i];
      if (item.MessageRTID == AMessageRTID)
        return i;
    }
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMessageCacheManager.Find() Error: ' + ErrorMessage);
  }
  return -1;
};

TspMessageCacheManager.prototype.Find = function (AMessageRTID)
{
  try
  {
    var i = this._InfexOf(AMessageRTID);
    if (i != -1)
    {
      var item = this.Cache[i];
      return item.Message;
    }
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMessageCacheManager.Find() Error: ' + ErrorMessage);
  }
  return null;
};

TspMessageCacheManager.prototype.Remove = function(AMessageRTID)
{
  try
  {
    var i = this._InfexOf(AMessageRTID);
    if (i != -1)
    {
      this.Cache.splice(i, 1);
    }
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMessageCacheManager.Remove() Error: ' + ErrorMessage);
  }
};

TspMessageCacheManager.prototype.Put = function(AMessageRTID, AMessage)
{
  if (AMessageRTID && AMessage)
  try
  {
    var item = new TspMessageCache(AMessageRTID, AMessage);
    this.Cache.push(item);
    return item;
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMessageCacheManager.Put() Error: ' + ErrorMessage);
  }
  return null;
};

TspMessageCacheManager.prototype.Clear = function()
{
  try
  {
    this.Cache.length = 0;
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMessageCacheManager.Clear() Error: ' + ErrorMessage);
  }
};



// TspMainModule ---------------------------------------------------------------

function TspMainModule()
{
  this.Log = {
    // log modes
    Info: false,
    ContentWorkers: false,
    TransportMessages: false,
    IncompleteDOMXml: false,
    OnTabSelect: false
  };

  var Self = this;

  this.IsPasswordManagerLocked = true;
  this.CreateCaptionButton();

  this.IsBrowserWindowFocused = true;
  windows.browserWindows.on('activate', function(AWindow) {
    Self.IsBrowserWindowFocused = true;
  });
  windows.browserWindows.on('deactivate', function(AWindow) {
    Self.IsBrowserWindowFocused = false;
  });
  
  tabs.on('activate', function (tab) {
    Self.ProcessTabSelected(tab);
  });

  this.MessageCacheManager = new TspMessageCacheManager();
  this.BackgroundWorker = null;
  this.ContentWorker = null;
  this.ContentWorkers = new Array();
  this.ContentWorkersDictFrameId = new Map();
	this.ContentWorkersDictTabId = new Map();
  this.AttachBackgroundWorker();
  this.AttachContentWorkers();

  if (this.Log.Info)
    spLog.logMessage('Main module initialized');
}

TspMainModule.prototype.destroy = function ()
{
  if (this.ContentWorker)
  {
    this.ContentWorker.destroy();
    this.ContentWorker = null;
  }
  if (this.BackgroundWorker)
  {
    this.BackgroundWorker.destroy();
    this.BackgroundWorker = null;
  }
  this.MessageCacheManager.Clear();
  this.DestroyCaptionButton();
};

TspMainModule.prototype.GetCaptionButtonIcon = function ()
{
  if (!this.IsPasswordManagerLocked)
    return {
      '16': self.data.url('img/logo16.png'),
      '32': self.data.url('img/logo32.png'),
      '64': self.data.url('img/logo64.png')
    };
  else
    return {
      '16': self.data.url('img/logo16-disabled.png'),
      '32': self.data.url('img/logo32-disabled.png'),
      '64': self.data.url('img/logo64-disabled.png')
    };
};

TspMainModule.prototype.CreateCaptionButton = function ()
{
  try
  {
    var Self = this;
    var buttonState = {
      id: 'spCaptionButton',
      label: 'Sticky Password',
      onClick: function () {
        Self.ProcessCaptionButtonClick();
      }
    };
    buttonState.icon = this.GetCaptionButtonIcon();
    this.ActionButton = spActionButton.CreateActionButton();
    this.ActionButton.CreateButton(buttonState);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.CreateCaptionButton() Error: ' + ErrorMessage);
  }
};

TspMainModule.prototype.DestroyCaptionButton = function ()
{
  try
  {
    if (this.ActionButton)
    {
      this.ActionButton.destroy();
      this.ActionButton = null;
    }
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.DestroyCaptionButton() Error: ' + ErrorMessage);
  }
};

// UpdateCaptionButton()
TspMainModule.prototype.UpdateCaptionButton = function()
{
  try
  {
    // update tab icon
    var buttonState = {};
    buttonState.icon = this.GetCaptionButtonIcon();
    this.ActionButton.UpdateButton(buttonState);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.UpdateCaptionButton() Error: ' + ErrorMessage);
  }
};

TspMainModule.prototype.ShowPasswordManagerNotStartedNotification = function ()
{						
  notifications.notify({
    title: 'Sticky Password',
    text: l10n.get('PasswordManagerNotStarted'),
    iconURL: self.data.url('img/logo64.png')
  });
};

TspMainModule.prototype.ProcessCaptionButtonClick = function ()
{
  var message = {};
  message.Action = 'ShowCaptionButtonMenu';
  this.AppendTabWindowInfoToMessage(message, tabs.activeTab);
  this.SendMessageToBackground(message);
};

TspMainModule.prototype.ProcessTabSelected = function(ATab)
{
  if (ATab)
  try
  {
    if (this.Log.OnTabSelect)
      spLog.logMessage('TspMainModule.ProcessTabSelected() ATab.url=<' + ATab.url + '>');
    var message = {};
    message.Action = 'TabSelected';
    message.Url = ATab.url;
    this.AppendTabWindowInfoToMessage(message, ATab);
    this.SendMessageToBackground(message);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.ProcessTabSelected() Error: ' + ErrorMessage);
  }
};

TspMainModule.prototype.GenerateClientId = function ()
{
  function _GeneratePart(MaxValue)
  {
    var Result = Math.floor((Math.random() * (MaxValue-1)) + 1);
    Result = Result.toString(16);
    return Result;
  }
  
  var Result = 
    '{' +
    _GeneratePart(4294967295) + '-' +
    _GeneratePart(65535) + '-' +
    _GeneratePart(65535) + '-' +
    _GeneratePart(65535) + '-' +
    _GeneratePart(4294967295) + _GeneratePart(65535) +
    '}'
  ;  
  return Result
};

TspMainModule.prototype.GetClientId = function ()
{
  if (typeof simpleStorage.storage.ClientId == 'undefined')
    simpleStorage.storage.ClientId = this.GenerateClientId();
  return simpleStorage.storage.ClientId;
};

TspMainModule.prototype.RemoveTransportSocketAccessKey = function ()
{
  delete simpleStorage.storage.AccessKey;
};

TspMainModule.prototype.SendMessageToBackground = function (message)
{
  if (this.BackgroundWorker && message)
    this.BackgroundWorker.port.emit('backgroundMessage', message);
};

TspMainModule.prototype.AttachBackgroundWorker = function ()
{
  var Self = this;
  this.BackgroundWorker = pageWorker.Page({
    contentScriptFile: [
      self.data.url('spRequire.js'),
      self.data.url('spLog.js'),
      self.data.url('content/spStrings.js'),
      self.data.url('content/spFormElementPrototype.js'),
      self.data.url('content/spAutofillCore.js'),
      self.data.url('content/spBrowserSpecificTools.js'),
      self.data.url('background/spBackground.js')
    ]
  });
  // connect to Background script
  this.BackgroundWorker.port.on('backgroundMessage', function (message) {
    Self.bsOnMessage(message);
  });
};

TspMainModule.prototype.bsGetTransportSocketInfo = function (message)
{
  var msgConnect = {};
  msgConnect.Action = 'ConnectToTransportSocketInfo';
  try
  {
    var passwordManagerConnector = spPasswordManagerConnector.CreatePasswordManagerConnector();
    msgConnect.Port = passwordManagerConnector.GetWebSocketPort();
    msgConnect.UserName = passwordManagerConnector.GetWebSocketUserName();
    msgConnect.ClientInfo = {};
    msgConnect.ClientInfo.ClientName = system.name;
    msgConnect.ClientInfo.ClientId = this.GetClientId();
    if (typeof simpleStorage.storage.AccessKey != 'undefined')
      msgConnect.ClientInfo.AccessKey = simpleStorage.storage.AccessKey;
    var temporaryAccessKey = passwordManagerConnector.GetTemporaryAccessKey(system.name);
    if (temporaryAccessKey)
      msgConnect.ClientInfo.TemporaryAccessKey = temporaryAccessKey;
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsGetTransportSocketInfo() Error: ' + ErrorMessage);
  }
  // always return result to prevent waiting timeout
  this.SendMessageToBackground(msgConnect);
};

TspMainModule.prototype.bsStoreTransportSocketAccessKey = function (message)
{
  try
  {
    if (this.Log.Info)
      spLog.logMessage('TspMainModule.bsStoreTransportSocketAccessKey() AccessKey: ' + message.AccessKey);
    if (typeof message.AccessKey != 'undefined')
      simpleStorage.storage.AccessKey = message.AccessKey;
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsStoreTransportSocketAccessKey() Error: ' + ErrorMessage);
  }
};

TspMainModule.prototype.bsPasswordManagerLockedChanged = function (message)
{
  try
  {
    if (this.IsPasswordManagerLocked != message.IsLocked)
    {
      if (this.Log.Info)
        spLog.logMessage('TspMainModule.bsPasswordManagerLockedChanged() IsLocked: ' + message.IsLocked);
      this.IsPasswordManagerLocked = message.IsLocked;
      this.UpdateCaptionButton();
      this.BroadcastMessageToContent(message);
    }
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsPasswordManagerLockedChanged() Error: ' + ErrorMessage);
  }
};

TspMainModule.prototype.ExecuteUrl = function(AUrl, AReusedTabCallback)
{
  try
  {
    var activeWindow = windows.browserWindows.activeWindow;
    if (activeWindow)
    {
      // search for empty tab
      var blankTab = null;
      for (var i = activeWindow.tabs.length-1; i >= 0; i--)
      {
        var tab = activeWindow.tabs[i];
        // tab is blank - store it
        if (spSameText(tab.url, 'about:blank') ||
            spSameText(tab.url, 'about:newtab')
           )
        {
          blankTab = tab;
        }
        else if (spSameText(tab.url, AUrl) ||
                 spSameText(tab.url, AUrl + '/')
                )
        {
          // the Url is already opened - activate the tab
          tab.activate();
          if (AReusedTabCallback)
            AReusedTabCallback(tab);
          return;
        }
      }
      if (blankTab)
      {
        blankTab.activate();
        blankTab.url = AUrl;
        return;
      }
    }
    // the Url isn't opened, open it now
    tabs.open({
      url: AUrl
    });
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.ExecuteUrl() Error: ' + ErrorMessage);
  }
};  

TspMainModule.prototype.bsPasswordManagerNotStarted = function (message)
{
  // try to launch password manager
  try
  {
    var passwordManagerConnector = spPasswordManagerConnector.CreatePasswordManagerConnector();
    if (passwordManagerConnector.LaunchPasswordManager())
      return;
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsPasswordManagerNotStarted() Error: ' + ErrorMessage);
  }

  this.ShowPasswordManagerNotStartedNotification();
};

TspMainModule.prototype.bsExtensionNotAuthenticated = function (message)
{
  notifications.notify({
    title: 'Sticky Password',
    text: l10n.get('ExtensionNotAuthenticated', system.name),
    iconURL: self.data.url('img/logo64.png')
  });
};

TspMainModule.prototype.bsExecuteUrl = function (message)
{
  try
  {
    if (this.Log.Info)
      spLog.logMessage('TspMainModule.bsExecuteUrl(), Url: <' + message.Url + '>');
    var Self = this;
    this.ExecuteUrl(message.Url,
      function /* AReusedTabCallback */(AReusedTab)
      {
        if (!AReusedTab)
          return;
        if (Self.Log.Info)
          spLog.logMessage('TspMainModule.bsExecuteUrl() tab reused, simulate PageLoaded event');
        // call autofill if tab with executing Url has been reused
        var msgSimulatePageLoaded = { Action: 'SimulatePageLoaded' };
        Self.SendMessageToTabContent(msgSimulatePageLoaded, AReusedTab.id);
      }
    );
    // return the result of message processing
    message.Result = true;
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsExecuteUrl() Error: ' + ErrorMessage);
  }
  delete message.Url; // clear Url to prevent additional resources costs
  // always return result to prevent waiting timeout
  this.SendMessageToBackground(message);
};

TspMainModule.prototype.bsIsActiveDocumentComplete = function (message)
{
  try
  {
    if (this.Log.Info)
      spLog.logMessage('TspMainModule.bsIsActiveDocumentComplete()');
    var activeTab = tabs.activeTab;
    message.IsComplete = activeTab.readyState == 'complete';
    if (this.Log.Info)
      spLog.logMessage('   IsComplete: ' + message.IsComplete);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsIsActiveDocumentComplete() Error: ' + ErrorMessage);
  }
  // always return result to prevent waiting timeout
  this.SendMessageToBackground(message);
};

TspMainModule.prototype.bsGetUrl = function (message)
{
  try
  {
    if (this.Log.Info)
      spLog.logMessage('TspMainModule.bsGetUrl()');
    var activeTab = tabs.activeTab;
    message.Url = activeTab.url;
    if (this.Log.Info)
      spLog.logMessage('   Url: <' + message.Url + '>');
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsGetUrl() Error: ' + ErrorMessage);
  }
  // always return result to prevent waiting timeout
  this.SendMessageToBackground(message);
};

TspMainModule.prototype.bsAutofillDocument = function (message)
{
  try
  {
    if (this.Log.Info)
      spLog.logMessage('TspMainModule.bsAutofillDocument()');
    var tabId = message.tabId;
    var frameId = message.frameId;
    delete message.tabId;
    delete message.frameId;
    this.SendMessageToTabContent(message, tabId, frameId);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsAutofillDocument() Error: ' + ErrorMessage);
  }
};

TspMainModule.prototype.bsGetDOMXml = function (message)
{
  try
  {
    if (this.Log.Info)
      spLog.logMessage('TspMainModule.bsGetDOMXml()');
    var activeTab = tabs.activeTab;
    if (activeTab)
    {
      this.SendMessageToTabContent(message, activeTab.id);
      return;
    }
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsGetDOMXml() Error: ' + ErrorMessage);
  }
  // always return result to prevent waiting timeout in case of error
  this.SendMessageToBackground(message);
};

TspMainModule.prototype.bsGetFocusedElementScreenRect = function (message)
{
  try
  {
    if (this.Log.Info)
      spLog.logMessage('TspMainModule.bsGetFocusedElementScreenRect()');
    var activeTab = tabs.activeTab;
    if (activeTab)
    {
      this.SendMessageToTabContent(message, activeTab.id);
      return;
    }
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsGetFocusedElementScreenRect() Error: ' + ErrorMessage);
  }
  // always return result to prevent waiting timeout in case of error
  this.SendMessageToBackground(message);
};

TspMainModule.prototype.bsSetFocusedElementSelectedText = function (message)
{
  try
  {
    if (this.Log.Info)
      spLog.logMessage('TspMainModule.bsSetFocusedElementSelectedText()');
    var activeTab = tabs.activeTab;
    if (activeTab)
    {
      message.RTID = Math.floor((Math.random() * 10000) + 1).toString(16);
      this.MessageCacheManager.Put(message.RTID, message);
      this.SendMessageToTabContent(message, activeTab.id);
      return;
    }
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsSetFocusedElementSelectedText() Error: ' + ErrorMessage);
  }
  // always return result to prevent waiting timeout in case of error
  this.SendMessageToBackground(message);
};

TspMainModule.prototype.bsOnMessage = function (message)
{
  if (message)
  try
  {
    if (this.Log.TransportMessages)
      spLog.logMessage('TspMainModule.bsOnMessage() Received message from BS: ' + JSON.stringify(message));

    if (message.Action == 'GetTransportSocketInfo')
      this.bsGetTransportSocketInfo(message);

    else if (message.Action == 'StoreTransportSocketAccessKey')
      this.bsStoreTransportSocketAccessKey(message);

    else if (message.Action == 'PasswordManagerLockedChanged')
      this.bsPasswordManagerLockedChanged(message);

    else if (message.Action == 'PasswordManagerNotStarted')
      this.bsPasswordManagerNotStarted(message);

    else if (message.Action == 'ExtensionNotAuthenticated')
      this.bsExtensionNotAuthenticated(message);

    else if (message.Action == 'ExecuteUrl')
      this.bsExecuteUrl(message);

    else if (message.Action == 'IsActiveDocumentComplete')
      this.bsIsActiveDocumentComplete(message);

    else if (message.Action == 'GetUrl')
      this.bsGetUrl(message);

    else if (message.Action == 'AutofillDocument')
      this.bsAutofillDocument(message);

    else if (message.Action == 'GetDOMXml')
      this.bsGetDOMXml(message);

    else if (message.Action == 'GetFocusedElementScreenRect')
      this.bsGetFocusedElementScreenRect(message);

    else if (message.Action == 'SetFocusedElementSelectedText')
      this.bsSetFocusedElementSelectedText(message);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.bsOnMessage() Error: ' + ErrorMessage);
  }
};

// post the message to the Content Script of all tabs and frames
TspMainModule.prototype.BroadcastMessageToContent = function (message)
{
  if (!message)
    return;
  try
  {
    for (var i = this.ContentWorkers.length-1; i >= 0; i--)
    {
      var worker = this.ContentWorkers[i];
      this.SendMessageToContent(worker, message);
    }
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.BroadcastMessageToContent() Error: ' + ErrorMessage);
  }
};
  
// post the message to the Content Script of tab and frame,
//   if no ATabId specified - use active tab,
//   if no AFrameId specified - use top window of tab
TspMainModule.prototype.SendMessageToTabContent = function (message, ATabId, AFrameId)
{
  if (!message)
    return;

  if (typeof AFrameId == 'undefined')
    AFrameId = 0; // top window as default

  if (typeof ATabId == 'undefined' || !ATabId)
  {
    var activeTab = tabs.activeTab;
    if (activeTab)
      ATabId = activeTab.id;
  }
  if (!ATabId)
    throw 'ATabId not specified!';

  var tabWorker;
  if (AFrameId)
    tabWorker = this.FindContentWorkerByTabAndFrameId(ATabId, AFrameId);
  else
    tabWorker = this.FindTopContentWorkerByTabId(ATabId);
  if (!tabWorker)
    throw 'tabWorker not found for tab "' + ATabId + '"!';

  this.SendMessageToContent(tabWorker, message);
};

TspMainModule.prototype.SendMessageToContent = function (AWorker, message)
{
  if (AWorker && message)
    AWorker.port.emit('contentMessage', message);
};

TspMainModule.prototype.AddFrame = function (AWorker)
{
	var newframeId = Math.floor((Math.random() * 10000) + 1);
	while (this.ContentWorkersDictFrameId.has(newframeId))
	{
		newframeId = Math.floor((Math.random() * 10000) + 1);
	}

	AWorker.frameId = newframeId;
	this.ContentWorkersDictFrameId.set(newframeId, AWorker);
}

TspMainModule.prototype.AttachContentWorker = function (AWorker)
{
  if (!AWorker)
    return;
  var Self = this;
  if (this.FindTopContentWorkerByTabId(AWorker.tab.id))
  {
    // any frame of top window, generate frameId for it
    this.AddFrame(AWorker);
  }
  else
  {
    // top window, use empty string
    AWorker.frameId = 0;
		this.ContentWorkersDictTabId.set(AWorker.tab.id, AWorker);
  }
  this.ContentWorkers.push(AWorker);

  if (this.Log.ContentWorkers)
    spLog.logMessage('TspMainModule.AttachContentWorker() ContentWorker attached, ' +
      'ContentWorkers.length: ' + this.ContentWorkers.length + ' ' +
      'worker.frameId=' + AWorker.frameId + ' ' +
      'tab.id=<' + AWorker.tab.id + '> ' +
      'tab.url: <' + AWorker.tab.url + '> ' +
      'tab: <' + AWorker.tab.title + '>'
    );
  AWorker.on('detach', function () {
    Self.DetachContentWorker(AWorker);
  });
  // connect to Content script
  AWorker.port.on('contentMessage', function (message) {
    Self.csOnMessage(AWorker, message);
  });

};

TspMainModule.prototype.DetachContentWorker = function (AWorker)
{
  if (!AWorker)
    return;
  var index = this.ContentWorkers.indexOf(AWorker);
  if (index != -1)
  {
    // manually send HideShowedCaptionButtonBalloon message when detaching from the top page
    if (!AWorker.frameId)
      this.csHideShowedCaptionButtonBalloon(AWorker, { Action: 'HideShowedCaptionButtonBalloon' });

    this.ContentWorkers.splice(index, 1);
    if (this.Log.ContentWorkers)
      spLog.logMessage('TspMainModule.DetachContentWorker() ContentWorker [' + index + '] detached, ' +
        'worker.frameId=' + AWorker.frameId + ' ' +
        'ContentWorkers.length: ' + this.ContentWorkers.length
      );
  }
	if (AWorker.frameId)
	{
		if (AWorker.frameId != 0)
		{
			this.ContentWorkersDictFrameId.delete(AWorker.frameId)
		}
		else
		{
			this.ContentWorkersDictTabId.delete(AWorker.tab.id)
		}
	}
	else
	{
		this.ContentWorkersDictTabId.delete(AWorker.tab.id)
	}
	
};

TspMainModule.prototype.AttachContentWorkers = function ()
{
  var Self = this;
  this.ContentWorker = pageMod.PageMod({
    include: ['http://*', 'https://*', 'file://*'],
    attachTo: ['top', 'existing', 'frame'],
    contentScriptWhen: 'start',
    contentScript: [
      self.data.load('spRequire.js'),
      self.data.load('spLog.js'),
      self.data.load('content/spStrings.js'),
      self.data.load('content/spFormElementPrototype.js'),
      self.data.load('content/spAutofillCore.js'),
      self.data.load('content/spBrowserSpecificTools.js'),
      self.data.load('content/spPageEventsMonitor.js'),
      self.data.load('content/spContent.js')
    ]
,
    onAttach: function (AWorker) {
      Self.AttachContentWorker(AWorker);
    }
  });
};

TspMainModule.prototype.FindTopContentWorkerByTabId = function (ATabId)
{
    try
    {
			if (this.ContentWorkersDictTabId.has(ATabId))
				return this.ContentWorkersDictTabId.get(ATabId);
    }
    catch (ErrorMessage)
    {
      spLog.logError('TspMainModule.FindTopContentWorkerByTabId() Error: ' + ErrorMessage);
    }
  return null;
};

TspMainModule.prototype.FindContentWorkerByTabAndFrameId = function (ATabId, AFrameId)
{
    try
    {

	if (AFrameId == 0)
	{
		if (this.ContentWorkersDictTabId.has(ATabId))
		{
			return this.ContentWorkersDictTabId.get(ATabId);
		}
	}
	else
	{
		if (this.ContentWorkersDictFrameId.has(AFrameId))
		{
			return this.ContentWorkersDictFrameId.get(AFrameId);
		}
	}

    }
    catch (ErrorMessage)
    {
      spLog.logError('TspMainModule.FindContentWorkerByTabAndFrameId() Error: ' + ErrorMessage);
    }
  return null;
};

// this function appends necessary info of currently active window to the message
//   to allow find the web browser window
TspMainModule.prototype.AppendTabWindowInfoToMessage = function(message, tab)
{
  if (!message || !tab)
    return;
  if (tab.window)
  {
    // window can be undefined if "Never remember history" setting selected
    message.WindowTitle = tab.window.title;
  }
};

// this function updates necessary info of specified tab
//   if the message sent by frame and not by top window of tab
TspMainModule.prototype.UpdateTabInfoInMessage = function(senderWorker, message)
{
  if (!senderWorker || !message)
    return;
  // update message info from the tab (top window)
  if (senderWorker.frameId)
  {
    if (senderWorker.tab)
    {
      if (typeof message.LocationName != 'undefined')
      {
        message.LocationName = senderWorker.tab.title;
        message.UpdateTopDocumentInfoInDOMXml = true;
      }
      if (typeof message.Url != 'undefined')
      {
        message.Url = senderWorker.tab.url;
        message.UpdateTopDocumentInfoInDOMXml = true;
      }
    }
  }
};

TspMainModule.prototype.csOnMessage = function (senderWorker, message)
{
  if (senderWorker && message)
  try
  {
    if (this.Log.TransportMessages)
      this.csLogTransportMessage(senderWorker, message);

    // DocumentComplete()
    if (message.Action == 'DocumentComplete')
      this.csDocumentComplete(senderWorker, message);

    // AutofillCallback()
    else if (message.Action == 'AutofillCallback')
      this.csAutofillCallback(senderWorker, message);

    // BeforeSubmit()
    else if (message.Action == 'BeforeSubmit')
      this.csBeforeSubmit(senderWorker, message);

    // GetDOMXml()
    else if (message.Action == 'GetDOMXml')
      this.csGetDOMXml(senderWorker, message);

    // GetFocusedElementScreenRect()
    else if (message.Action == 'GetFocusedElementScreenRect')
      this.csGetFocusedElementScreenRect(senderWorker, message);

    // ElementFocused()
    else if (message.Action == 'ElementFocused')
      this.csElementFocused(senderWorker, message);

    // ShowCaptionButtonMenu()
    else if (message.Action == 'ShowCaptionButtonMenu')
      this.csShowCaptionButtonMenu(senderWorker, message);

    // HideShowedCaptionButtonBalloon()
    else if (message.Action == 'HideShowedCaptionButtonBalloon')
      this.csHideShowedCaptionButtonBalloon(senderWorker, message);

    // ReturnForbiddenDOMXml()
    else if (message.Action == 'ReturnForbiddenDOMXml')
      this.csReturnForbiddenDOMXml(senderWorker, message);

    // GetCachedMessage()
    else if (message.Action == 'GetCachedMessage')
      this.csGetCachedMessage(senderWorker, message);

    // RemoveCachedMessage()
    else if (message.Action == 'RemoveCachedMessage')
      this.csRemoveCachedMessage(senderWorker, message);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.csOnMessage() Error: ' + ErrorMessage);
  }
};

// csLogTransportMessage()
TspMainModule.prototype.csLogTransportMessage = function (senderWorker, message)
{
  if (senderWorker && message)
  try
  {
    var s = 'TspMainModule.csOnMessage() Received message from CS: ' + JSON.stringify(message);
    if (senderWorker && senderWorker.tab)
      s = s + ' sender.tab.id=<' + senderWorker.tab.id + '> sender.tab.url=<' + senderWorker.tab.url + '>';
    spLog.logMessage(s);
  }
  catch (ErrorMessage)
  {
    // keep silence
  }
};

// csDocumentComplete()
TspMainModule.prototype.csDocumentComplete = function (senderWorker, message)
{
  if (senderWorker && message)
  try
  {
    this.AppendTabWindowInfoToMessage(message, senderWorker.tab);
    var IsActiveTab = tabs.activeTab == senderWorker.tab;
    message.IsActiveTab = this.IsBrowserWindowFocused && IsActiveTab;
    if (this.Log.Info)
      spLog.logMessage('csDocumentComplete() ' + 
        'IsBrowserWindowFocused=' + this.IsBrowserWindowFocused + ' ' +
        'IsActiveTab=' + IsActiveTab + ' ' +
        'message.IsActiveTab=' + message.IsActiveTab
      );
    message.tabId = senderWorker.tab.id;
    this.SendMessageToBackground(message);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.csDocumentComplete() Error: ' + ErrorMessage);
  }
};

// csAutofillCallback()
TspMainModule.prototype.csAutofillCallback = function (senderWorker, message)
{
  if (senderWorker && message)
  try
  {
    this.AppendTabWindowInfoToMessage(message, senderWorker.tab);
    this.SendMessageToBackground(message);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.csAutofillCallback() Error: ' + ErrorMessage);
  }
};

// csBeforeSubmit()
TspMainModule.prototype.csBeforeSubmit = function (senderWorker, message)
{
  if (senderWorker && message)
  try
  {
    this.AppendTabWindowInfoToMessage(message, senderWorker.tab);
    this.UpdateTabInfoInMessage(senderWorker, message);
    this.SendMessageToBackground(message);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.csBeforeSubmit() Error: ' + ErrorMessage);
  }
};

// csGetDOMXml()
TspMainModule.prototype.csGetDOMXml = function (senderWorker, message)
{
  if (senderWorker && message)
  try
  {
    this.SendMessageToBackground(message);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.csGetDOMXml() Error: ' + ErrorMessage);
  }
};

// csGetFocusedElementScreenRect()
TspMainModule.prototype.csGetFocusedElementScreenRect = function (senderWorker, message)
{
  if (senderWorker && message)
  try
  {
    if (this.Log.Info)
      spLog.logMessage('   FocusedElementScreenRect: [' + 
        (message.FocusedElementScreenRect ? 
         message.FocusedElementScreenRect.left + 'x' + message.FocusedElementScreenRect.top + '/' + 
         message.FocusedElementScreenRect.right + 'x' + message.FocusedElementScreenRect.bottom
         :
         'null'
        ) + ']'
      );
    this.SendMessageToBackground(message);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.csGetFocusedElementScreenRect() Error: ' + ErrorMessage);
  }
};
  
// csElementFocused()
TspMainModule.prototype.csElementFocused = function (senderWorker, message)
{
  if (senderWorker && message && senderWorker.tab == tabs.activeTab)
  try
  {
    if (senderWorker.frameId)
      message.frameId = senderWorker.frameId;
    this.AppendTabWindowInfoToMessage(message, senderWorker.tab);
    this.UpdateTabInfoInMessage(senderWorker, message);
    this.SendMessageToBackground(message);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.csElementFocused() Error: ' + ErrorMessage);
  }
};

// csShowCaptionButtonMenu()
TspMainModule.prototype.csShowCaptionButtonMenu = function (senderWorker, message)
{
  if (senderWorker && message)
  try
  {
    this.AppendTabWindowInfoToMessage(message, senderWorker.tab);
    this.SendMessageToBackground(message);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.csShowCaptionButtonMenu() Error: ' + ErrorMessage);
  }
};

// csHideShowedCaptionButtonBalloon()
TspMainModule.prototype.csHideShowedCaptionButtonBalloon = function (senderWorker, message)
{
  if (senderWorker && message)
  try
  {
    this.AppendTabWindowInfoToMessage(message, senderWorker.tab);
    this.SendMessageToBackground(message);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.csHideShowedCaptionButtonBalloon() Error: ' + ErrorMessage);
  }
};

// csReturnForbiddenDOMXml()
TspMainModule.prototype.csReturnForbiddenDOMXml = function (senderWorker, message)
{
  if (senderWorker && message)
  {
    // resend the message to background worker
    message.tabId = senderWorker.tab.id;
    message.frameId = senderWorker.frameId;
    this.SendMessageToBackground(message);
  }
};

// GetCachedMessage()
TspMainModule.prototype.csGetCachedMessage = function(senderWorker, message)
{
  if (senderWorker && message)
  try
  {
    var cachedMessage = this.MessageCacheManager.Find(message.RTID);
    if (cachedMessage)
      this.SendMessageToContent(senderWorker, cachedMessage);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.csGetCachedMessage() Error: ' + ErrorMessage);
  }
};

// RemoveCachedMessage()
TspMainModule.prototype.csRemoveCachedMessage = function(senderWorker, message)
{
  if (message)
  try
  {
    var cachedMessage = this.MessageCacheManager.Find(message.RTID);
    if (cachedMessage)
      this.MessageCacheManager.Remove(message.RTID);
  }
  catch (ErrorMessage)
  {
    spLog.logError('TspMainModule.csRemoveCachedMessage() Error: ' + ErrorMessage);
  }
};



var spMainModule = null;

exports.main = function(options, callbacks) {
  if (!spMainModule)
    spMainModule = new TspMainModule();
};

exports.onUnload = function (reason) {
  if (spMainModule)
  {
    if (reason == 'uninstall' || reason == 'disable')
      spMainModule.RemoveTransportSocketAccessKey();
    spMainModule.destroy();
    spMainModule = null;
  }
};
