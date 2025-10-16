# Frontend File Upload System

## 🎯 **Overview**

A comprehensive file upload system for the Causalytics platform that allows users to upload CSV files to Amazon S3 and manage their data projects.

## 🏗️ **Components**

### **FileUpload.tsx**
- **Drag & Drop Interface** - Users can drag CSV files directly onto the upload area
- **Project Management** - Create and select projects for organizing files
- **File Validation** - Ensures only CSV files under 10MB are uploaded
- **Progress Tracking** - Real-time upload progress with visual feedback
- **Error Handling** - Clear error messages for failed uploads

### **FileList.tsx**
- **File Display** - Shows all uploaded files for a selected project
- **File Details** - Displays file size, type, and metadata
- **File Selection** - Click to select files for analysis
- **Action Buttons** - Preview, analyze, and download options (coming soon)

### **DataManagement.tsx**
- **Main Interface** - Combines upload and file management
- **Project Workflow** - Guides users through the upload process
- **Quick Start Guide** - Step-by-step instructions for new users

### **Dashboard.tsx** (Updated)
- **Navigation** - Easy access to Data Management page
- **Feature Cards** - Interactive cards for different platform features
- **User Information** - Displays current user details

## 🚀 **Features**

### **Upload Features**
- ✅ **Drag & Drop** - Intuitive file upload interface
- ✅ **File Validation** - CSV-only, 10MB size limit
- ✅ **Progress Tracking** - Real-time upload progress
- ✅ **Project Organization** - Create and manage projects
- ✅ **Error Handling** - Clear feedback for issues

### **File Management**
- ✅ **File Listing** - View all uploaded files
- ✅ **File Details** - Size, type, and metadata display
- ✅ **File Selection** - Click to select files
- ✅ **Refresh** - Manual refresh of file list

### **User Experience**
- ✅ **Responsive Design** - Works on desktop and mobile
- ✅ **Loading States** - Spinners and progress indicators
- ✅ **Error Messages** - Clear, actionable error feedback
- ✅ **Success Feedback** - Confirmation of successful actions

## 🔧 **Technical Details**

### **API Integration**
- **Authentication** - JWT token-based authentication
- **Project Management** - Create and list projects
- **File Upload** - Multipart form data to S3
- **File Listing** - Retrieve uploaded files

### **State Management**
- **React Context** - Global authentication state
- **Local State** - Component-specific state management
- **API Calls** - Axios for HTTP requests

### **Styling**
- **Inline Styles** - Component-scoped styling
- **Responsive Design** - Mobile-friendly layouts
- **Visual Feedback** - Hover states and transitions

## 📱 **User Flow**

1. **Login/Register** - User authenticates with the platform
2. **Dashboard** - User sees available features
3. **Data Management** - User clicks "Go to Data Management"
4. **Create Project** - User creates a new project (if needed)
5. **Upload Files** - User drags CSV files to upload area
6. **View Files** - User sees uploaded files in the file list
7. **Select File** - User clicks on a file to view details
8. **Next Steps** - User can preview, analyze, or download files

## 🎨 **UI/UX Features**

### **Visual Design**
- **Clean Interface** - Minimal, professional design
- **Color Coding** - Blue for primary actions, green for success
- **Icons** - Emoji icons for visual appeal
- **Cards** - Organized content in card layouts

### **Interactions**
- **Hover Effects** - Visual feedback on interactive elements
- **Loading States** - Spinners during API calls
- **Transitions** - Smooth animations for state changes
- **Responsive** - Adapts to different screen sizes

## 🔮 **Future Enhancements**

### **Planned Features**
- **File Preview** - Show CSV data in a table
- **File Analysis** - Start causal inference analysis
- **File Download** - Download files from S3
- **Bulk Operations** - Select multiple files
- **File Search** - Search through uploaded files
- **File History** - Track file changes over time

### **Advanced Features**
- **Data Validation** - Check CSV structure and data quality
- **Schema Detection** - Automatically detect column types
- **Data Preview** - Show first few rows of data
- **Metadata Extraction** - Extract and display file metadata

## 🧪 **Testing**

### **Manual Testing**
1. **Authentication** - Login/register flow
2. **Project Creation** - Create new projects
3. **File Upload** - Upload various CSV files
4. **File Management** - View and select files
5. **Error Handling** - Test with invalid files

### **Test Cases**
- ✅ Valid CSV upload
- ✅ Invalid file type rejection
- ✅ File size limit enforcement
- ✅ Project creation and selection
- ✅ File listing and selection
- ✅ Error message display

## 🚀 **Getting Started**

1. **Start Backend** - Ensure Flask API is running on port 5001
2. **Start Frontend** - Run `npm start` in the frontend directory
3. **Open Browser** - Navigate to `http://localhost:3000`
4. **Login/Register** - Create an account or login
5. **Upload Files** - Go to Data Management and upload CSV files

## 📚 **Learning Points**

### **React Concepts**
- **Functional Components** - Modern React with hooks
- **State Management** - useState and useEffect hooks
- **Context API** - Global state management
- **Event Handling** - Form submissions and user interactions

### **API Integration**
- **Axios** - HTTP client for API calls
- **Authentication** - JWT token handling
- **Error Handling** - Proper error management
- **Loading States** - User feedback during API calls

### **File Handling**
- **File API** - Browser file handling
- **FormData** - Multipart file uploads
- **Drag & Drop** - HTML5 drag and drop API
- **File Validation** - Client-side validation

This file upload system provides a complete solution for users to manage their data files in the Causalytics platform! 🎉
